import { isPlausibleEmail, type AppErrorShape } from '@postloom/core';
import { assetIdSchema, EMAIL_FONTS, writeDocumentSchema } from '@postloom/editor';
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
});

export const DEFAULT_PREFERENCES: Preferences = {
  colorScheme: 'auto',
  textScale: 1,
  confirmBeforeSend: true,
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
});

export const saveTemplateInputSchema = z.object({
  id: idSchema,
  name: templateNameSchema.optional(),
  subject: subjectSchema.optional(),
  document: writeDocumentSchema.optional(),
  defaultSenderProfileId: idSchema.nullable().optional(),
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

export const emailAccountSchema = connectionSchema.extend({
  id: idSchema,
  name: z.string(),
  provider: providerIdSchema,
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
});

export const updateSenderInputSchema = createSenderInputSchema.partial().extend({ id: idSchema });

/** "Send me a test": the template as it is now, from one of your senders. */
export const sendTemplateTestInputSchema = z.object({
  id: idSchema,
  senderId: idSchema,
  /** Defaults to the sender's email account address. */
  to: emailSchema.optional(),
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
  };
  accounts: {
    list: Call<'accounts:list'>;
    create: Call<'accounts:create'>;
    update: Call<'accounts:update'>;
    delete: Call<'accounts:delete'>;
    testConnection: Call<'accounts:testConnection'>;
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
  assets: {
    pickImage: Call<'assets:pickImage'>;
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
    restoreVersion: Call<'templates:restoreVersion'>;
  };
}
