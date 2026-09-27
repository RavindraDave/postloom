import { isPlausibleEmail, type AppErrorShape } from '@postloom/core';
import {
  assetIdSchema,
  EMAIL_FONTS,
  senderSignatureSchema,
  writeDocumentSchema,
} from '@postloom/editor';
import { z } from 'zod';

/**
 * The complete IPC surface between the renderer and the main process
 * (PLAN.md §6.5). Every request is validated against `input` in the main
 * process and every response against `output` before it is returned.
 * Adding a channel here is the only way to expose new capability to the UI.
 */

export const appInfoSchema = z.object({
  name: z.string(),
  version: z.string(),
  platform: z.enum(['win32', 'darwin', 'linux']),
});

/** A newer version, when there is one (the app only links to its download page). */
export const updateStatusSchema = z.object({
  state: z.enum(['upToDate', 'available', 'unknown', 'managedByStore', 'off']),
  latestVersion: z.string().max(64).nullable(),
  checkedAt: z.string().nullable(),
});

/** Upper bound on template source size accepted over IPC (1 MB of text). */
export const MAX_TEMPLATE_SOURCE_LENGTH = 1_000_000;

export const renderPreviewInputSchema = z.object({
  mjml: z.string().min(1).max(MAX_TEMPLATE_SOURCE_LENGTH),
});

export const renderPreviewOutputSchema = z.object({
  html: z.string(),
  text: z.string(),
  warnings: z.array(z.string()),
});

// ---------------------------------------------------------------- Preferences

export const preferencesSchema = z.object({
  /** Follow the computer's light/dark setting, or force one. */
  colorScheme: z.enum(['auto', 'light', 'dark']),
  /** Text size, as a multiple of normal (Settings → "Text size"). */
  textScale: z.number().min(0.9).max(1.3),
  /** Always show the "Ready to send?" confirmation. */
  confirmBeforeSend: z.boolean(),
  /** How long finished sends stay in History, in days; 0 keeps them forever. */
  historyDays: z.union([z.literal(0), z.literal(30), z.literal(90), z.literal(365)]),
  /** Wait between emails, for senders and accounts without their own (Settings → Sending). */
  delayMs: z.number().int().min(0).max(600_000),
  /** Most emails a day from any one account, unless the account or provider allows fewer. */
  dailyLimit: z.number().int().min(1).max(100_000),
  /** Look for a newer version on the download page, once a day (not in Store installs). */
  checkForUpdates: z.boolean(),
});

export const DEFAULT_PREFERENCES: Preferences = {
  colorScheme: 'auto',
  textScale: 1,
  confirmBeforeSend: true,
  historyDays: 0,
  delayMs: 2000,
  dailyLimit: 450,
  checkForUpdates: true,
};

// ------------------------------------------------------------------ Templates

const idSchema = z.string().min(1).max(64);
const templateNameSchema = z.string().trim().min(1).max(120);
const subjectSchema = z
  .string()
  .max(300)
  .refine((value) => !/[\r\n]/.test(value), 'Subjects cannot contain line breaks');

export const templateSummarySchema = z.object({
  id: idSchema,
  name: z.string(),
  category: z.string().nullable(),
  subject: z.string(),
  editorMode: z.enum(['write', 'design']),
  /** Spreadsheet columns the template uses ("Details it uses from your list"). */
  fields: z.array(z.string()),
  updatedAt: z.string(),
});

export const templateDetailSchema = templateSummarySchema.extend({
  document: writeDocumentSchema,
  defaultSenderProfileId: idSchema.nullable(),
});

export const templateVersionSchema = z.object({
  versionNo: z.number().int().positive(),
  subject: z.string(),
  note: z.string().nullable(),
  createdAt: z.string(),
});

export const createTemplateInputSchema = z.object({
  name: templateNameSchema,
  subject: subjectSchema,
  category: z.string().trim().max(60).nullable().optional(),
  document: writeDocumentSchema.optional(),
  editorMode: z.enum(['write', 'design']).optional(),
});

export const saveTemplateInputSchema = z.object({
  id: idSchema,
  name: templateNameSchema.optional(),
  subject: subjectSchema.optional(),
  document: writeDocumentSchema.optional(),
  defaultSenderProfileId: idSchema.nullable().optional(),
  editorMode: z.enum(['write', 'design']).optional(),
  /** True for a manual save: also keeps a version to restore later. */
  snapshot: z.boolean().optional(),
});

const byId = z.object({ id: idSchema });
const ok = z.object({ ok: z.literal(true) });

// ------------------------------------------------------ Accounts and senders

const emailSchema = z
  .string()
  .trim()
  .max(254)
  .refine((value) => isPlausibleEmail(value), 'Not a valid email address');

const hostSchema = z
  .string()
  .trim()
  .min(1)
  .max(253)
  .regex(/^[A-Za-z0-9.-]+$/, 'Server names contain only letters, digits, dots and dashes');

const connectionSchema = z.object({
  host: hostSchema,
  port: z.number().int().min(1).max(65535),
  security: z.enum(['tls', 'starttls']),
  username: z.string().trim().min(1).max(254),
});

/**
 * App passwords are typed by the person, so they cross IPC renderer → main
 * once. They are never sent back to the renderer.
 */
const passwordSchema = z.string().min(1).max(256);

export const providerIdSchema = z.enum(['gmail', 'outlook', 'yahoo', 'zoho', 'icloud', 'other']);

/** How an account signs in: a password, or Google's or Microsoft's own sign-in. */
export const accountAuthSchema = z.enum(['password', 'google', 'microsoft']);
export const signInProviderSchema = z.enum(['google', 'microsoft']);

export const emailAccountSchema = connectionSchema.extend({
  id: idSchema,
  name: z.string(),
  provider: providerIdSchema,
  auth: accountAuthSchema,
  hasPassword: z.boolean(),
  dailyLimit: z.number().int().nullable(),
  delayMs: z.number().int().nullable(),
  lastTestedAt: z.string().nullable(),
  lastTestOk: z.boolean().nullable(),
  /** How many senders send through this account ("Used by 2 senders"). */
  senderCount: z.number().int(),
});

export const createAccountInputSchema = connectionSchema.extend({
  name: z.string().trim().min(1).max(80),
  provider: providerIdSchema,
  password: passwordSchema,
  dailyLimit: z.number().int().min(1).max(100_000).nullable().optional(),
  delayMs: z.number().int().min(0).max(60_000).nullable().optional(),
});

export const updateAccountInputSchema = createAccountInputSchema.partial().extend({ id: idSchema });

export const testConnectionInputSchema = connectionSchema.extend({ password: passwordSchema });

const sourceSchema = z.enum(['app', 'account', 'sender', 'provider']);
const inheritedNumberSchema = z.object({ value: z.number(), source: sourceSchema });

// ----------------------------------------------------- Pictures and brand looks

/** A stored picture (never the bytes: the app serves those itself). */
export const assetSchema = z.object({
  id: idSchema,
  mime: z.string(),
  size: z.number().int(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  name: z.string().nullable(),
});

const hexColourSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a colour like #0E6B66');

/** A sender's brand look: logo, colour and font used in its emails. */
export const brandSchema = z.object({
  primaryColor: hexColourSchema,
  fontFamily: z.enum(EMAIL_FONTS.map((font) => font.stack) as [string, ...string[]]),
  logo: z
    .object({ assetId: assetIdSchema, width: z.number().int(), height: z.number().int() })
    .nullable(),
});

export const brandInputSchema = brandSchema.omit({ logo: true }).extend({
  logoAssetId: assetIdSchema.nullable(),
});

export const senderSchema = z.object({
  id: idSchema,
  name: z.string(),
  emailAccountId: idSchema,
  fromName: z.string(),
  fromAddress: z.string(),
  replyTo: z.string().nullable(),
  delayMs: z.number().int().nullable(),
  /** The sender's signature, placed in templates with a Signature block. */
  signature: senderSignatureSchema.nullable(),
  templateCount: z.number().int(),
  /** The sender's brand look, if it has one. */
  brand: brandSchema.nullable(),
  /** Values in force after inheritance, and where each comes from. */
  effective: z.object({ delayMs: inheritedNumberSchema, dailyLimit: inheritedNumberSchema }),
});

const nameInHeaderSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine((value) => !/[\r\n"<>]/.test(value), 'Names cannot contain line breaks, quotes or < >');

export const createSenderInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  emailAccountId: idSchema,
  fromName: nameInHeaderSchema,
  fromAddress: emailSchema,
  replyTo: emailSchema.nullable().optional(),
  delayMs: z.number().int().min(0).max(60_000).nullable().optional(),
  signature: senderSignatureSchema.nullable().optional(),
});

export const updateSenderInputSchema = createSenderInputSchema.partial().extend({ id: idSchema });

/** "Send me a test": the template as it is now, from one of your senders. */
export const sendTemplateTestInputSchema = z.object({
  id: idSchema,
  senderId: idSchema,
  /** Defaults to the sender's email account address. */
  to: emailSchema.optional(),
  /** One person's details from the list; without them details show as [First Name]. */
  values: z.record(z.string().max(200), z.string().max(10_000)).optional(),
});

// ------------------------------------------------------------- Recipients

const columnNameSchema = z.string().min(1).max(200);

export const columnMappingSchema = z.object({
  to: columnNameSchema.nullable(),
  cc: columnNameSchema.nullable(),
  bcc: columnNameSchema.nullable(),
  enabled: columnNameSchema.nullable(),
  attachments: columnNameSchema.nullable(),
});

export const fieldMapSchema = z.record(z.string().max(64), columnNameSchema.nullable());

/** A spreadsheet the person picked, kept in the main process (never its path). */
const listRefSchema = z.object({
  token: z.uuid(),
  sheet: z.string().max(200),
  /** Once a template is chosen, its personal details are matched to columns too. */
  templateId: idSchema.optional(),
});

const listChoicesSchema = listRefSchema.extend({
  mapping: columnMappingSchema,
  fieldMap: fieldMapSchema,
});

export const recipientProblemSchema = z.object({
  id: z.enum([
    'missingColumn',
    'noAddress',
    'invalidAddress',
    'overDailyLimit',
    'emptyDetail',
    'duplicate',
    'doNotEmail',
    'disabled',
    'largeSend',
    'attachmentMissing',
    'attachmentBlocked',
    'attachmentTooBig',
    'attachmentOutside',
  ]),
  severity: z.enum(['mustFix', 'worthALook', 'info']),
  rows: z.array(z.number().int()),
  values: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
});

export const listCheckSchema = z.object({
  problems: z.array(recipientProblemSchema),
  /** Row numbers of the people who will get an email, in order. */
  toSendRows: z.array(z.number().int()),
  leftOut: z.object({
    skipped: z.number().int(),
    disabled: z.number().int(),
    doNotEmail: z.number().int(),
    duplicate: z.number().int(),
  }),
  dailyLimit: z.number().int(),
  remainingToday: z.number().int(),
  /** Files attached across everyone who'll get an email. */
  attachments: z.object({
    files: z.number().int(),
    bytes: z.number().int(),
    /** Folders the files come from that the person hasn't approved yet. */
    outsideFolders: z.array(z.string()),
  }),
});

export const checkListInputSchema = listChoicesSchema.extend({
  templateId: idSchema,
  senderId: idSchema,
  skipRows: z.array(z.number().int()).max(25_000),
  sendDuplicatesOnce: z.boolean(),
});

// ------------------------------------------------------------------ Sends

export const pauseReasonSchema = z.enum([
  'user',
  'dailyLimit',
  'auth',
  'connection',
  'interrupted',
  'sleep',
]);

const countSchema = z.number().int().min(0);

export const sendSummarySchema = z.object({
  id: idSchema,
  status: z.enum(['draft', 'ready', 'sending', 'paused', 'stopped', 'finished']),
  pauseReason: pauseReasonSchema.nullable(),
  /** True while emails are actually going out (the sending process is running). */
  running: z.boolean(),
  templateName: z.string(),
  senderName: z.string(),
  accountName: z.string(),
  fileName: z.string(),
  counts: z.object({
    pending: countSchema,
    sending: countSchema,
    sent: countSchema,
    failed: countSchema,
    skipped: countSchema,
    uncertain: countSchema,
  }),
  /** Who's being emailed right now. */
  current: z.object({ rowNo: z.number().int(), to: z.string() }).nullable(),
  /** Rough time left, in milliseconds. */
  etaMs: z.number().min(0),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
});

export const sendProblemSchema = z.object({
  rowNo: z.number().int(),
  to: z.string(),
  status: z.enum(['failed', 'uncertain', 'skipped']),
  /** A short reason code, shown in plain words (e.g. `rejected:550`). */
  errorCode: z.string().nullable(),
});

export const backupSchema = z.object({
  fileName: z.string(),
  /** "daily", "manual", or "before-…" (taken automatically before an upgrade). */
  kind: z.string(),
  createdAt: z.string(),
  sizeBytes: z.number().int(),
});

export const secretProtectionSchema = z.enum(['keychain', 'weak', 'unavailable']);

// ------------------------------------------------------------------- Contract

export const ipcContract = {
  'app:getInfo': { input: z.undefined(), output: appInfoSchema },
  'app:getSecurity': {
    input: z.undefined(),
    output: z.object({ secretProtection: secretProtectionSchema }),
  },
  'accounts:list': { input: z.undefined(), output: z.array(emailAccountSchema) },
  'accounts:create': { input: createAccountInputSchema, output: emailAccountSchema },
  'accounts:update': { input: updateAccountInputSchema, output: emailAccountSchema },
  'accounts:delete': { input: byId, output: ok },
  /** Signs in without sending (setup wizard, before saving). */
  'accounts:testConnection': { input: testConnectionInputSchema, output: ok },
  /** Which sign-ins (Google, Microsoft) this build offers. */
  'accounts:signInProviders': { input: z.undefined(), output: z.array(signInProviderSchema) },
  /**
   * Signs in with Google or Microsoft in the browser and saves the account
   * (or, with accountId, signs a saved account in again).
   */
  'accounts:signIn': {
    input: z.object({
      provider: signInProviderSchema,
      accountId: idSchema.optional(),
      name: z.string().trim().max(80).optional(),
    }),
    output: emailAccountSchema,
  },
  /** Stops waiting for a sign-in the person gave up on. */
  'accounts:signInCancel': { input: z.undefined(), output: ok },
  /** Signs in with a saved account and records the result. */
  'accounts:test': { input: byId, output: emailAccountSchema },
  'accounts:sendTestEmail': {
    input: byId.extend({ to: emailSchema.optional() }),
    output: z.object({ sentTo: z.string() }),
  },
  'senders:list': { input: z.undefined(), output: z.array(senderSchema) },
  'senders:create': { input: createSenderInputSchema, output: senderSchema },
  'senders:update': { input: updateSenderInputSchema, output: senderSchema },
  'senders:delete': { input: byId, output: ok },
  'senders:setBrand': {
    input: z.object({ id: idSchema, brand: brandInputSchema.nullable() }),
    output: senderSchema,
  },
  /** Opens the computer's file picker; null if the person cancels. */
  'assets:pickImage': { input: z.undefined(), output: assetSchema.nullable() },
  /** Total bytes of the given pictures (for the checklist's "heavy pictures" warning). */
  'assets:totalSize': {
    input: z.object({ ids: z.array(assetIdSchema).max(100) }),
    output: z.object({ bytes: z.number().int() }),
  },
  'settings:get': { input: z.undefined(), output: preferencesSchema },
  'settings:update': { input: preferencesSchema.partial(), output: preferencesSchema },
  'templates:renderPreview': { input: renderPreviewInputSchema, output: renderPreviewOutputSchema },
  'templates:list': { input: z.undefined(), output: z.array(templateSummarySchema) },
  'templates:get': { input: byId, output: templateDetailSchema },
  'templates:create': { input: createTemplateInputSchema, output: templateDetailSchema },
  'templates:save': { input: saveTemplateInputSchema, output: templateDetailSchema },
  'templates:delete': { input: byId, output: ok },
  'templates:restore': { input: byId, output: ok },
  'templates:versions': { input: byId, output: z.array(templateVersionSchema) },
  /** Opens the computer's file picker for a spreadsheet; null if cancelled. */
  'recipients:pick': {
    input: z.undefined(),
    output: z
      .object({
        token: z.uuid(),
        fileName: z.string(),
        sheets: z.array(z.object({ name: z.string(), rowCount: z.number().int() })),
      })
      .nullable(),
  },
  /** The sheet's columns, a sample of rows and the best guess at matching them. */
  'recipients:inspect': {
    input: listRefSchema,
    output: z.object({
      headers: z.array(z.string()),
      sample: z.array(z.object({ rowNo: z.number().int(), cells: z.array(z.string()) })),
      rowCount: z.number().int(),
      mapping: columnMappingSchema,
      fields: z.array(z.object({ name: z.string(), hasFallback: z.boolean() })),
      fieldMap: fieldMapSchema,
    }),
  },
  /** Checks everyone before sending (and remembers the column choices). */
  'recipients:check': { input: checkListInputSchema, output: listCheckSchema },
  /** Starts sending to everyone who passed the check. */
  'sends:start': { input: checkListInputSchema, output: sendSummarySchema },
  'sends:get': { input: byId, output: sendSummarySchema },
  /** Recent sends, newest first. */
  'sends:list': { input: z.undefined(), output: z.array(sendSummarySchema) },
  /** Pause after the email going out now. */
  'sends:pause': { input: byId, output: sendSummarySchema },
  'sends:resume': { input: byId, output: sendSummarySchema },
  /** Stop after the email going out now (can be resumed later). */
  'sends:stop': { input: byId, output: sendSummarySchema },
  /** Puts people whose email failed back in the queue and carries on. */
  'sends:retryFailed': { input: byId, output: sendSummarySchema },
  /** Emails that may or may not have gone out: send them again, or skip them. */
  'sends:resolveUncertain': {
    input: z.object({ id: idSchema, action: z.enum(['resend', 'skip']) }),
    output: sendSummarySchema,
  },
  /** Saves a report of everyone in the send (CSV), where the person chooses. */
  'sends:exportReport': {
    input: byId,
    output: z.object({ saved: z.boolean(), fileName: z.string().nullable() }),
  },
  /** People not emailed, and why (failed, uncertain, left out). */
  'sends:problems': { input: byId, output: z.array(sendProblemSchema) },
  /** One person's addresses and details, for the preview. */
  'recipients:row': {
    input: listChoicesSchema.extend({ rowNo: z.number().int().min(1) }),
    output: z.object({
      rowNo: z.number().int(),
      to: z.array(z.string()),
      cc: z.array(z.string()),
      bcc: z.array(z.string()),
      values: z.record(z.string(), z.string()),
      attachments: z.array(
        z.object({
          name: z.string(),
          size: z.number().int(),
          problem: z.enum(['missing', 'blocked']).nullable(),
        }),
      ),
    }),
  },
  /** Trusts the folders the last check flagged, for attachments from now on. */
  'recipients:approveFolders': { input: z.object({ token: z.uuid() }), output: ok },
  /** Saves a diagnostics file for support (no passwords, addresses or content). */
  'app:exportDiagnostics': {
    input: z.undefined(),
    output: z.object({ saved: z.boolean(), fileName: z.string().nullable() }),
  },
  /**
   * Is a newer version on the download page? `check: true` looks now; otherwise
   * the answer from the last daily look. Store installs are updated by the Store.
   */
  'app:updateStatus': {
    input: z.object({ check: z.boolean() }),
    output: updateStatusSchema,
  },
  /** Opens the download page of a newer version in the browser (nothing is downloaded). */
  'app:openDownloadPage': { input: z.undefined(), output: ok },
  /** Backups of Postloom's data, newest first. */
  'data:backups': { input: z.undefined(), output: z.array(backupSchema) },
  'data:backupNow': { input: z.undefined(), output: backupSchema },
  /** Restores a backup (by name, from the list): Postloom restarts to do it. */
  'data:restore': { input: z.object({ fileName: z.string().max(200) }), output: ok },
  /** Opens Postloom's data folder in the computer's file manager. */
  'data:openFolder': { input: z.undefined(), output: ok },
  /** Deletes finished and stopped sends from History. */
  'data:clearHistory': { input: z.undefined(), output: z.object({ deleted: z.number().int() }) },
  /** Opens the computer's file picker for an .html file; null if cancelled. */
  /** An HTML email or Word document to import, with its pictures already stored. */
  'templates:pickHtml': {
    input: z.undefined(),
    output: z
      .object({
        name: z.string(),
        html: z.string(),
        kind: z.enum(['html', 'docx']),
        assetIds: z.array(assetIdSchema).max(30),
      })
      .nullable(),
  },
  'templates:sendTest': {
    input: sendTemplateTestInputSchema,
    output: z.object({ sentTo: z.string() }),
  },
  'templates:restoreVersion': {
    input: byId.extend({ versionNo: z.number().int().positive() }),
    output: templateDetailSchema,
  },
} as const;

export type IpcContract = typeof ipcContract;
export type IpcChannel = keyof IpcContract;
export type IpcInput<C extends IpcChannel> = z.infer<IpcContract[C]['input']>;
export type IpcOutput<C extends IpcChannel> = z.infer<IpcContract[C]['output']>;

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: AppErrorShape };

export const IPC_CHANNELS = Object.keys(ipcContract) as IpcChannel[];

export type AppInfo = IpcOutput<'app:getInfo'>;
export type UpdateStatus = IpcOutput<'app:updateStatus'>;
export type Preferences = z.infer<typeof preferencesSchema>;
export type RenderPreviewInput = IpcInput<'templates:renderPreview'>;
export type RenderPreviewOutput = IpcOutput<'templates:renderPreview'>;
export type TemplateSummary = z.infer<typeof templateSummarySchema>;
export type TemplateDetail = z.infer<typeof templateDetailSchema>;
export type TemplateVersionInfo = z.infer<typeof templateVersionSchema>;
export type CreateTemplateInput = z.infer<typeof createTemplateInputSchema>;
export type SaveTemplateInput = z.infer<typeof saveTemplateInputSchema>;
export type SendTemplateTestInput = z.infer<typeof sendTemplateTestInputSchema>;
export type EmailAccountInfo = z.infer<typeof emailAccountSchema>;
export type CreateAccountInput = z.infer<typeof createAccountInputSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountInputSchema>;
export type TestConnectionInput = z.infer<typeof testConnectionInputSchema>;
export type SenderInfo = z.infer<typeof senderSchema>;
export type CreateSenderInput = z.infer<typeof createSenderInputSchema>;
export type UpdateSenderInput = z.infer<typeof updateSenderInputSchema>;
export type AssetInfo = z.infer<typeof assetSchema>;
export type ColumnMappingInfo = z.infer<typeof columnMappingSchema>;
export type FieldMapInfo = z.infer<typeof fieldMapSchema>;
export type RecipientProblemInfo = z.infer<typeof recipientProblemSchema>;
export type ListCheck = z.infer<typeof listCheckSchema>;
export type CheckListInput = z.infer<typeof checkListInputSchema>;
export type SendSummary = z.infer<typeof sendSummarySchema>;
export type SendProblem = z.infer<typeof sendProblemSchema>;
export type PauseReasonInfo = z.infer<typeof pauseReasonSchema>;
export type BackupEntry = z.infer<typeof backupSchema>;
export type Brand = z.infer<typeof brandSchema>;
export type BrandInput = z.infer<typeof brandInputSchema>;
export type SecretProtection = z.infer<typeof secretProtectionSchema>;

type Call<C extends IpcChannel> =
  IpcInput<C> extends undefined
    ? () => Promise<IpcResult<IpcOutput<C>>>
    : (input: IpcInput<C>) => Promise<IpcResult<IpcOutput<C>>>;

/** The API the preload script exposes to the renderer as `window.postloom`. */
export interface PostloomApi {
  app: {
    getInfo: Call<'app:getInfo'>;
    getSecurity: Call<'app:getSecurity'>;
    exportDiagnostics: Call<'app:exportDiagnostics'>;
    updateStatus: Call<'app:updateStatus'>;
    openDownloadPage: Call<'app:openDownloadPage'>;
  };
  accounts: {
    list: Call<'accounts:list'>;
    create: Call<'accounts:create'>;
    update: Call<'accounts:update'>;
    delete: Call<'accounts:delete'>;
    testConnection: Call<'accounts:testConnection'>;
    signInProviders: Call<'accounts:signInProviders'>;
    signIn: Call<'accounts:signIn'>;
    signInCancel: Call<'accounts:signInCancel'>;
    test: Call<'accounts:test'>;
    sendTestEmail: Call<'accounts:sendTestEmail'>;
  };
  senders: {
    list: Call<'senders:list'>;
    create: Call<'senders:create'>;
    update: Call<'senders:update'>;
    delete: Call<'senders:delete'>;
    setBrand: Call<'senders:setBrand'>;
  };
  recipients: {
    pick: Call<'recipients:pick'>;
    inspect: Call<'recipients:inspect'>;
    check: Call<'recipients:check'>;
    row: Call<'recipients:row'>;
    approveFolders: Call<'recipients:approveFolders'>;
  };
  sends: {
    start: Call<'sends:start'>;
    get: Call<'sends:get'>;
    list: Call<'sends:list'>;
    pause: Call<'sends:pause'>;
    resume: Call<'sends:resume'>;
    stop: Call<'sends:stop'>;
    retryFailed: Call<'sends:retryFailed'>;
    resolveUncertain: Call<'sends:resolveUncertain'>;
    problems: Call<'sends:problems'>;
    exportReport: Call<'sends:exportReport'>;
  };
  data: {
    backups: Call<'data:backups'>;
    backupNow: Call<'data:backupNow'>;
    restore: Call<'data:restore'>;
    openFolder: Call<'data:openFolder'>;
    clearHistory: Call<'data:clearHistory'>;
  };
  assets: {
    pickImage: Call<'assets:pickImage'>;
    totalSize: Call<'assets:totalSize'>;
  };
  settings: {
    get: Call<'settings:get'>;
    update: Call<'settings:update'>;
  };
  templates: {
    renderPreview: Call<'templates:renderPreview'>;
    list: Call<'templates:list'>;
    get: Call<'templates:get'>;
    create: Call<'templates:create'>;
    save: Call<'templates:save'>;
    delete: Call<'templates:delete'>;
    restore: Call<'templates:restore'>;
    versions: Call<'templates:versions'>;
    sendTest: Call<'templates:sendTest'>;
    pickHtml: Call<'templates:pickHtml'>;
    restoreVersion: Call<'templates:restoreVersion'>;
  };
}
