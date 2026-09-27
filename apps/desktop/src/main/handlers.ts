import type { Template } from '@postloom/core';
import {
  preferencesSchema,
  type AppInfo,
  type TemplateDetail,
  type TemplateSummary,
} from '@postloom/contracts';
import type { Repositories } from '@postloom/db';
import { release } from 'node:os';
import { collectFields, writeDocumentSchema, type WriteDocument } from '@postloom/editor';
import { compileMjml, openMailer, sendEmail } from '@postloom/email';
import { createAccountHandlers, type AccountDeps } from './accounts';
import { createAssetHandlers, type AssetDeps } from './assets';
import { applyHistoryRetention, createDataHandlers, type DataStore } from './data';
import { buildDiagnostics } from './diagnostics';
import { importDocumentFile } from './document-import';
import { readDocument } from './documents';
import { loadPreferences as loadSavedPreferences, PREFERENCES_KEY } from './preferences';
import { createListService, type RecipientDeps } from './recipients';
import type { OAuthClient, OAuthProvider } from './oauth';
import { createAccountTokens } from './oauth-tokens';
import {
  createInProcessRunner,
  type RenewForAccount,
  type RunnerEvents,
  type SendRunner,
} from './send-runner';
import { createSendService, type SendService } from './sends';
import { createTemplateTestHandler } from './template-test';
import type { IpcHandlers } from './ipc-router';
import type { UpdateChecker } from './updates';

const WRITE_DOCUMENT_VERSION = 1;

/** A blank letter for "Write a new letter". */
export const BLANK_LETTER: WriteDocument = { type: 'doc', content: [{ type: 'paragraph' }] };

export interface HandlerDeps extends Omit<AccountDeps, 'repos'>, Partial<Omit<AssetDeps, 'repos'>> {
  appInfo: AppInfo;
  repos: Repositories;
  /** Shows the computer's file picker for an HTML file; null if cancelled. */
  /** Shows the computer's file picker for an HTML email or Word document; null if cancelled. */
  pickDocumentPath?: () => Promise<string | null>;
  /** Shows the computer's file picker for a spreadsheet; null if cancelled. */
  pickSpreadsheetFile?: RecipientDeps['pickSpreadsheetFile'];
  todayUtc?: RecipientDeps['todayUtc'];
  /** Where sends run; defaults to this process (tests). The app uses the sending process. */
  createSendRunner?: (events: RunnerEvents, renewAccessToken?: RenewForAccount) => SendRunner;
  /** Google and Microsoft apps this build can sign in with (none: passwords only). */
  oauthClients?: Partial<Record<OAuthProvider, OAuthClient>>;
  /** Opens the connection an in-process send uses (tests fake it). */
  openMailer?: typeof openMailer;
  /** Shows a notification from the computer. */
  notify?: (title: string, body: string) => void;
  saveFile?: (suggestedName: string, csv: string) => Promise<string | null>;
  /** Backups and the data folder (tests fake it). */
  dataStore?: DataStore;
  /** Looks for a newer version on the download page (none in tests). */
  updates?: UpdateChecker;
}

/** Without an update checker (tests), nothing is ever reported. */
const noUpdates: UpdateChecker = {
  status: () => Promise.resolve({ state: 'unknown', latestVersion: null, checkedAt: null }),
  check: () => Promise.resolve({ state: 'unknown', latestVersion: null, checkedAt: null }),
  checkIfDue: () => Promise.resolve({ state: 'unknown', latestVersion: null, checkedAt: null }),
  openDownloadPage: () => Promise.resolve(),
};

/** Without a real data folder (tests), there are no backups to list or take. */
const noDataStore: DataStore = {
  list: () => [],
  backupNow: () => {
    throw new Error('No data folder');
  },
  restoreOnRestart: () => undefined,
  openFolder: () => Promise.resolve(),
};

/** Without a real file picker (tests), picking a picture just cancels. */
const noPicker: Omit<AssetDeps, 'repos'> = {
  codec: { decode: () => null },
  pickImageFile: () => Promise.resolve(null),
};

export function createHandlers(deps: HandlerDeps): IpcHandlers {
  return createMainServices(deps).handlers;
}

/** Every IPC handler, plus the send service the app needs for sleep and quit. */
export function createMainServices({
  appInfo,
  repos,
  codec,
  pickImageFile,
  pickDocumentPath = () => Promise.resolve(null),
  pickSpreadsheetFile = () => Promise.resolve(null),
  todayUtc,
  createSendRunner,
  openMailer: mailerFor = openMailer,
  notify,
  saveFile,
  dataStore = noDataStore,
  updates = noUpdates,
  oauthClients = {},
  ...rest
}: HandlerDeps): { handlers: IpcHandlers; sends: SendService } {
  const tokens = createAccountTokens({ repos, vault: rest.vault, clients: oauthClients });
  const accountDeps = { ...rest, tokens };
  const renewAccessToken: RenewForAccount = async (accountId, renew) =>
    tokens.accessToken(await repos.accounts.get(accountId), renew);
  const lists = createListService({ repos, pickSpreadsheetFile, ...(todayUtc && { todayUtc }) });
  const sends = createSendService({
    repos,
    vault: accountDeps.vault,
    extraCa: accountDeps.extraCa,
    tokens,
    oauth: accountDeps.oauth,
    lists,
    createRunner: (events) =>
      createSendRunner
        ? createSendRunner(events, renewAccessToken)
        : createInProcessRunner({ repos, openMailer: mailerFor, renewAccessToken }, events),
    ...(notify && { notify }),
    ...(saveFile && { saveFile }),
  });

  const loadPreferences = () => loadSavedPreferences(repos);

  const handlers: IpcHandlers = {
    ...createAccountHandlers({ repos, ...accountDeps }),
    ...createAssetHandlers({
      repos,
      codec: codec ?? noPicker.codec,
      pickImageFile: pickImageFile ?? noPicker.pickImageFile,
    }),
    ...lists.handlers,
    ...sends.handlers,
    ...createDataHandlers({ repos, store: dataStore, isSending: sends.isSending }),
    ...createTemplateTestHandler({
      repos,
      vault: accountDeps.vault,
      extraCa: accountDeps.extraCa,
      tokens,
      oauth: accountDeps.oauth,
      send: accountDeps.smtp?.send ?? sendEmail,
    }),

    'app:getInfo': () => Promise.resolve(appInfo),

    'app:exportDiagnostics': async () => {
      const diagnostics = await buildDiagnostics(repos, {
        appInfo,
        runtime: {
          electron: process.versions.electron,
          chrome: process.versions.chrome,
          node: process.versions.node,
          arch: process.arch,
          osRelease: release(),
        },
        secretProtection: accountDeps.vault.protection(),
        preferences: await loadPreferences(),
        backups: dataStore.list().length,
      });
      const day = new Date().toISOString().slice(0, 10);
      const fileName = await (saveFile ?? (() => Promise.resolve(null)))(
        `Postloom diagnostics ${day}.json`,
        `${JSON.stringify(diagnostics, null, 2)}\n`,
      );
      return { saved: fileName !== null, fileName };
    },

    'app:updateStatus': ({ check }) => (check ? updates.check() : updates.status()),
    'app:openDownloadPage': async () => {
      await updates.openDownloadPage();
      return { ok: true as const };
    },

    'settings:get': loadPreferences,
    'settings:update': async (changes) => {
      const next = preferencesSchema.parse({ ...(await loadPreferences()), ...changes });
      await repos.settings.set(PREFERENCES_KEY, next);
      // A shorter History setting takes effect straight away.
      if (changes.historyDays !== undefined) await applyHistoryRetention(repos, next.historyDays);
      return next;
    },

    'templates:renderPreview': async ({ mjml }) => compileMjml(mjml),

    'templates:pickHtml': async () => {
      const path = await pickDocumentPath();
      return path ? importDocumentFile(path, { repos, codec: codec ?? noPicker.codec }) : null;
    },

    'templates:list': async () => (await repos.templates.list()).map(toSummary),
    'templates:get': async ({ id }) => toDetail(await repos.templates.get(id)),
    'templates:create': async ({ name, subject, category, document, editorMode }) =>
      toDetail(
        await repos.templates.create({
          name,
          subject,
          category: category ?? null,
          editorMode: editorMode ?? 'write',
          document: document ?? BLANK_LETTER,
          documentVersion: WRITE_DOCUMENT_VERSION,
          defaultSenderProfileId: null,
        }),
      ),
    'templates:save': async ({
      id,
      name,
      subject,
      document,
      defaultSenderProfileId,
      editorMode,
      snapshot,
    }) =>
      toDetail(
        await repos.templates.update(
          id,
          {
            ...(name !== undefined && { name }),
            ...(subject !== undefined && { subject }),
            ...(document !== undefined && { document }),
            ...(defaultSenderProfileId !== undefined && { defaultSenderProfileId }),
            ...(editorMode !== undefined && { editorMode }),
          },
          { snapshot: snapshot ?? false },
        ),
      ),
    'templates:delete': async ({ id }) => {
      await repos.templates.softDelete(id);
      return { ok: true as const };
    },
    'templates:restore': async ({ id }) => {
      await repos.templates.restore(id);
      return { ok: true as const };
    },
    'templates:versions': async ({ id }) =>
      (await repos.templates.versions(id)).map((v) => ({
        versionNo: v.versionNo,
        subject: v.subject,
        note: v.note,
        createdAt: v.createdAt,
      })),
    'templates:restoreVersion': async ({ id, versionNo }) =>
      toDetail(await repos.templates.restoreVersion(id, versionNo)),
  };
  return { handlers, sends };
}

function toSummary(template: Template): TemplateSummary {
  const document = writeDocumentSchema.safeParse(template.document);
  return {
    id: template.id,
    name: template.name,
    category: template.category,
    subject: template.subject,
    editorMode: template.editorMode,
    fields: document.success ? collectFields(document.data) : [],
    updatedAt: template.updatedAt,
  };
}

function toDetail(template: Template): TemplateDetail {
  const document = readDocument(template);
  return {
    ...toSummary(template),
    document,
    defaultSenderProfileId: template.defaultSenderProfileId,
  };
}
