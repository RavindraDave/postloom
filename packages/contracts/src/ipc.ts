import type { AppErrorShape } from '@postloom/core';
import { writeDocumentSchema } from '@postloom/editor';
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
  /** True for a manual save: also keeps a version to restore later. */
  snapshot: z.boolean().optional(),
});

const byId = z.object({ id: idSchema });
const ok = z.object({ ok: z.literal(true) });

// ------------------------------------------------------------------- Contract

export const ipcContract = {
  'app:getInfo': { input: z.undefined(), output: appInfoSchema },
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

type Call<C extends IpcChannel> =
  IpcInput<C> extends undefined
    ? () => Promise<IpcResult<IpcOutput<C>>>
    : (input: IpcInput<C>) => Promise<IpcResult<IpcOutput<C>>>;

/** The API the preload script exposes to the renderer as `window.postloom`. */
export interface PostloomApi {
  app: {
    getInfo: Call<'app:getInfo'>;
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
    restoreVersion: Call<'templates:restoreVersion'>;
  };
}
