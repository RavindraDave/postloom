import { randomUUID } from 'node:crypto';
import {
  AppError,
  DEFAULT_DAILY_LIMIT,
  PROVIDER_PRESETS,
  resolveDailyLimitWithSource,
} from '@postloom/core';
import type { Repositories } from '@postloom/db';
import { templateFields } from '@postloom/editor';
import {
  buildRecipients,
  checkRecipients,
  guessMapping,
  matchFields,
  readSpreadsheet,
  reconcileMapping,
  toRecipientTable,
  type ColumnMapping,
  type FieldMap,
  type RecipientTable,
} from '@postloom/recipients';
import type { PickedFile } from './assets';
import { readDocument } from './documents';
import type { IpcHandlers } from './ipc-router';

export interface RecipientDeps {
  repos: Repositories;
  /** Shows the computer's file picker (spreadsheets only); null if cancelled. */
  pickSpreadsheetFile: () => Promise<PickedFile | null>;
  /** Today's date in UTC as YYYY-MM-DD (for the daily limit). */
  todayUtc?: () => string;
}

/** Rows shown while matching columns. */
export const SAMPLE_ROWS = 20;
/** Picked lists kept in memory; older ones are forgotten. */
const KEPT_LISTS = 3;

interface PickedList {
  fileName: string;
  sheets: Map<string, RecipientTable>;
}

/** The address columns chosen last time (lists usually look the same). */
const MAPPING_KEY = 'send:mapping';
/** Which column fills each detail, remembered per template. */
const fieldMapKey = (templateId: string) => `send:fields:${templateId}`;

type RecipientHandlers = Pick<
  IpcHandlers,
  'recipients:pick' | 'recipients:inspect' | 'recipients:check' | 'recipients:row'
>;

/**
 * The spreadsheet is picked and read here in the main process and kept here.
 * The screen only gets a token, a sample of rows and check results: never
 * the file's path, and never the whole file.
 */
export function createRecipientHandlers({
  repos,
  pickSpreadsheetFile,
  todayUtc = () => new Date().toISOString().slice(0, 10),
}: RecipientDeps): RecipientHandlers {
  const lists = new Map<string, PickedList>();

  const sheetFor = (token: string, sheet: string): RecipientTable => {
    const table = lists.get(token)?.sheets.get(sheet);
    if (!table) {
      throw new AppError({ code: 'NOT_FOUND', messageKey: 'errors.listGone' });
    }
    return table;
  };

  const fieldsFor = async (templateId: string | undefined) => {
    if (templateId === undefined) return [];
    const template = await repos.templates.get(templateId);
    return templateFields(template.subject, readDocument(template));
  };

  const recipientsFor = (input: {
    token: string;
    sheet: string;
    mapping: ColumnMapping;
    fieldMap: FieldMap;
  }) => buildRecipients(sheetFor(input.token, input.sheet), input.mapping, input.fieldMap);

  return {
    'recipients:pick': async () => {
      const file = await pickSpreadsheetFile();
      if (!file) return null;
      const sheets = (await readSpreadsheet(file.bytes, file.name))
        .map((sheet) => ({ name: sheet.name, table: toRecipientTable(sheet.rows) }))
        .filter((sheet) => sheet.table.headers.length > 0);
      if (sheets.length === 0) {
        throw new AppError({ code: 'VALIDATION_FAILED', messageKey: 'errors.spreadsheetEmpty' });
      }
      const token = randomUUID();
      lists.set(token, {
        fileName: file.name,
        sheets: new Map(sheets.map((sheet) => [sheet.name, sheet.table])),
      });
      // Keep only the last few lists: a big spreadsheet takes real memory.
      for (const old of [...lists.keys()].slice(0, -KEPT_LISTS)) lists.delete(old);
      return {
        token,
        fileName: file.name.slice(0, 200),
        sheets: sheets.map((sheet) => ({ name: sheet.name, rowCount: sheet.table.rows.length })),
      };
    },

    'recipients:inspect': async ({ token, sheet, templateId }) => {
      const table = sheetFor(token, sheet);
      const mapping = await repos.settings.get<Partial<ColumnMapping> | null>(MAPPING_KEY, null);
      const fieldMap =
        templateId === undefined
          ? {}
          : await repos.settings.get<FieldMap>(fieldMapKey(templateId), {});
      const fields = await fieldsFor(templateId);
      return {
        headers: table.headers,
        sample: table.rows.slice(0, SAMPLE_ROWS),
        rowCount: table.rows.length,
        mapping: mapping ? reconcileMapping(mapping, table.headers) : guessMapping(table.headers),
        fields,
        fieldMap: matchFields(
          fields.map((field) => field.name),
          table.headers,
          fieldMap,
        ),
      };
    },

    'recipients:check': async (input) => {
      const recipients = recipientsFor(input);
      const sender = await repos.senders.get(input.senderId);
      const account = await repos.accounts.get(sender.emailAccountId);
      const dailyLimit = resolveDailyLimitWithSource({
        appDefault: DEFAULT_DAILY_LIMIT,
        accountLimit: account.dailyLimit ?? undefined,
        providerLimit: PROVIDER_PRESETS[account.provider].dailyLimit ?? undefined,
      }).value;
      const remainingToday = Math.max(
        0,
        dailyLimit - (await repos.usage.sentOn(account.id, todayUtc())),
      );
      const doNotEmail = new Set((await repos.suppression.list()).map((entry) => entry.email));

      const result = checkRecipients({
        recipients,
        fields: await fieldsFor(input.templateId),
        fieldMap: input.fieldMap,
        doNotEmail,
        remainingToday,
        skipRows: new Set(input.skipRows),
        sendDuplicatesOnce: input.sendDuplicatesOnce,
      });
      await repos.settings.set(MAPPING_KEY, input.mapping);
      await repos.settings.set(fieldMapKey(input.templateId), input.fieldMap);

      const leftOut = { skipped: 0, disabled: 0, doNotEmail: 0, duplicate: 0 };
      for (const row of result.leftOut) leftOut[row.reason] += 1;
      return {
        problems: result.problems,
        toSendRows: result.toSend.map((recipient) => recipient.rowNo),
        leftOut,
        dailyLimit,
        remainingToday,
      };
    },

    // Runs inside a promise so a missing row rejects rather than throws.
    'recipients:row': ({ rowNo, ...input }) =>
      Promise.resolve().then(() => {
        const recipient = recipientsFor(input).find((row) => row.rowNo === rowNo);
        if (!recipient) {
          throw new AppError({ code: 'NOT_FOUND', messageKey: 'errors.rowNotFound' });
        }
        return {
          rowNo: recipient.rowNo,
          to: recipient.to,
          cc: recipient.cc,
          bcc: recipient.bcc,
          values: recipient.values,
        };
      }),
  };
}
