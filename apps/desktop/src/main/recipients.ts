import { createHash, randomUUID } from 'node:crypto';
import {
  AppError,
  DEFAULT_DAILY_LIMIT,
  MAX_ATTACHMENT_BYTES,
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
import {
  createAttachmentResolver,
  nodeFileSystem,
  type AttachmentFile,
  type FileSystem,
} from './attachment-files';
import { readDocument } from './documents';
import type { IpcHandlers } from './ipc-router';

export interface RecipientDeps {
  repos: Repositories;
  /** Shows the computer's file picker (spreadsheets only); null if cancelled. */
  pickSpreadsheetFile: () => Promise<(PickedFile & { folder?: string }) | null>;
  /** File access for attachments (tests fake it). */
  fs?: FileSystem;
  /** Today's date in UTC as YYYY-MM-DD (for the daily limit). */
  todayUtc?: () => string;
}

/** Rows shown while matching columns. */
export const SAMPLE_ROWS = 20;
/** Picked lists kept in memory; older ones are forgotten. */
const KEPT_LISTS = 3;

interface PickedList {
  fileName: string;
  /** A fingerprint of the file, kept with each send (never the file or its path). */
  sha256: string;
  /** The spreadsheet's folder: relative attachment paths start here. */
  folder: string | null;
  sheets: Map<string, RecipientTable>;
}

/** The choices made in the send wizard, as checked before sending. */
export interface ListChoices {
  token: string;
  sheet: string;
  templateId: string;
  senderId: string;
  mapping: ColumnMapping;
  fieldMap: FieldMap;
  skipRows: number[];
  sendDuplicatesOnce: boolean;
}

/** The address columns chosen last time (lists usually look the same). */
const MAPPING_KEY = 'send:mapping';
/** Folders the person has approved for attachments (besides the list's own). */
const APPROVED_FOLDERS_KEY = 'send:approvedFolders';
/** Which column fills each detail, remembered per template. */
const fieldMapKey = (templateId: string) => `send:fields:${templateId}`;

type RecipientHandlers = Pick<
  IpcHandlers,
  | 'recipients:pick'
  | 'recipients:inspect'
  | 'recipients:check'
  | 'recipients:row'
  | 'recipients:approveFolders'
>;

/**
 * Picked lists, kept in the main process: the spreadsheet is picked and read
 * here, and the screen only gets a token, a sample of rows and check
 * results, never the file's path or the whole file.
 */
export function createListService({
  repos,
  pickSpreadsheetFile,
  todayUtc = () => new Date().toISOString().slice(0, 10),
  fs = nodeFileSystem,
}: RecipientDeps) {
  const lists = new Map<string, PickedList>();
  /** Folders flagged by the latest check of each list, for "Trust these folders". */
  const flagged = new Map<string, string[]>();

  const resolverFor = async (token: string) =>
    createAttachmentResolver(
      lists.get(token)?.folder ?? null,
      await repos.settings.get<string[]>(APPROVED_FOLDERS_KEY, []),
      fs,
    );

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

  /** Checks everyone with the given choices (and remembers the column choices). */
  const check = async (input: ListChoices) => {
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

    // Attachments: every file must be there, not a key or password file, and
    // not too big for one email; files from unapproved folders are worth a look.
    const resolveFile = await resolverFor(input.token);
    const files = new Map<number, AttachmentFile[]>();
    const missing: number[] = [];
    const blocked: number[] = [];
    const tooBig: number[] = [];
    const outside = new Map<string, number[]>();
    let fileCount = 0;
    let bytes = 0;
    for (const person of result.toSend) {
      const found = person.attachments.map(resolveFile);
      files.set(person.rowNo, found);
      if (found.some((file) => file.problem === 'missing')) missing.push(person.rowNo);
      if (found.some((file) => file.problem === 'blocked')) blocked.push(person.rowNo);
      const size = found.reduce((sum, file) => sum + file.size, 0);
      if (size > MAX_ATTACHMENT_BYTES) tooBig.push(person.rowNo);
      fileCount += found.length;
      bytes += size;
      for (const file of found) {
        if (!file.outsideFolder) continue;
        const rows = outside.get(file.outsideFolder) ?? [];
        if (!rows.includes(person.rowNo)) rows.push(person.rowNo);
        outside.set(file.outsideFolder, rows);
      }
    }
    const problems = [...result.problems];
    if (blocked.length)
      problems.push({ id: 'attachmentBlocked', severity: 'mustFix', rows: blocked });
    if (missing.length)
      problems.push({ id: 'attachmentMissing', severity: 'mustFix', rows: missing });
    if (tooBig.length) {
      problems.push({
        id: 'attachmentTooBig',
        severity: 'mustFix',
        rows: tooBig,
        values: { limit: Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024)) },
      });
    }
    const outsideFolders = [...outside.keys()].sort();
    if (outsideFolders.length) {
      problems.push({
        id: 'attachmentOutside',
        severity: 'worthALook',
        rows: [...new Set([...outside.values()].flat())].sort((a, b) => a - b),
        values: { folder: outsideFolders[0] ?? '', folders: outsideFolders.length },
      });
    }
    flagged.set(input.token, outsideFolders);

    return {
      ...result,
      problems,
      recipients,
      account,
      sender,
      dailyLimit,
      remainingToday,
      files,
      attachments: { files: fileCount, bytes, outsideFolders },
    };
  };

  const file = (token: string) => {
    const list = lists.get(token);
    if (!list) throw new AppError({ code: 'NOT_FOUND', messageKey: 'errors.listGone' });
    return { fileName: list.fileName, sha256: list.sha256 };
  };

  const handlers: RecipientHandlers = {
    'recipients:pick': async () => {
      const picked = await pickSpreadsheetFile();
      if (!picked) return null;
      const sheets = (await readSpreadsheet(picked.bytes, picked.name))
        .map((sheet) => ({ name: sheet.name, table: toRecipientTable(sheet.rows) }))
        .filter((sheet) => sheet.table.headers.length > 0);
      if (sheets.length === 0) {
        throw new AppError({ code: 'VALIDATION_FAILED', messageKey: 'errors.spreadsheetEmpty' });
      }
      const token = randomUUID();
      lists.set(token, {
        fileName: picked.name,
        sha256: createHash('sha256').update(picked.bytes).digest('hex'),
        folder: picked.folder ?? null,
        sheets: new Map(sheets.map((sheet) => [sheet.name, sheet.table])),
      });
      // Keep only the last few lists: a big spreadsheet takes real memory.
      for (const old of [...lists.keys()].slice(0, -KEPT_LISTS)) lists.delete(old);
      return {
        token,
        fileName: picked.name.slice(0, 200),
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

    // Runs inside a promise so a missing row rejects rather than throws.
    'recipients:row': async ({ rowNo, ...input }) => {
      const recipient = recipientsFor(input).find((row) => row.rowNo === rowNo);
      if (!recipient) {
        throw new AppError({ code: 'NOT_FOUND', messageKey: 'errors.rowNotFound' });
      }
      const resolveFile = await resolverFor(input.token);
      return {
        rowNo: recipient.rowNo,
        to: recipient.to,
        cc: recipient.cc,
        bcc: recipient.bcc,
        values: recipient.values,
        attachments: recipient.attachments.map((typed) => {
          const file = resolveFile(typed);
          return { name: file.name, size: file.size, problem: file.problem };
        }),
      };
    },

    'recipients:approveFolders': async ({ token }) => {
      const folders = flagged.get(token) ?? [];
      const approved = await repos.settings.get<string[]>(APPROVED_FOLDERS_KEY, []);
      await repos.settings.set(APPROVED_FOLDERS_KEY, [...new Set([...approved, ...folders])]);
      return { ok: true as const };
    },

    'recipients:check': async (input) => {
      const result = await check(input);
      const leftOut = { skipped: 0, disabled: 0, doNotEmail: 0, duplicate: 0 };
      for (const row of result.leftOut) leftOut[row.reason] += 1;
      return {
        problems: result.problems,
        toSendRows: result.toSend.map((recipient) => recipient.rowNo),
        leftOut,
        dailyLimit: result.dailyLimit,
        remainingToday: result.remainingToday,
        attachments: result.attachments,
      };
    },
  };

  return { handlers, check, file };
}

export type ListService = ReturnType<typeof createListService>;
