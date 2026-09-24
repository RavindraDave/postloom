import type { AppErrorShape } from '@postloom/core';
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

export const ipcContract = {
  'app:getInfo': { input: z.undefined(), output: appInfoSchema },
  'templates:renderPreview': { input: renderPreviewInputSchema, output: renderPreviewOutputSchema },
} as const;

export type IpcContract = typeof ipcContract;
export type IpcChannel = keyof IpcContract;
export type IpcInput<C extends IpcChannel> = z.infer<IpcContract[C]['input']>;
export type IpcOutput<C extends IpcChannel> = z.infer<IpcContract[C]['output']>;

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: AppErrorShape };

export const IPC_CHANNELS = Object.keys(ipcContract) as IpcChannel[];

export type AppInfo = IpcOutput<'app:getInfo'>;
export type RenderPreviewInput = IpcInput<'templates:renderPreview'>;
export type RenderPreviewOutput = IpcOutput<'templates:renderPreview'>;

/** The API the preload script exposes to the renderer as `window.postloom`. */
export interface PostloomApi {
  app: {
    getInfo(): Promise<IpcResult<AppInfo>>;
  };
  templates: {
    renderPreview(input: RenderPreviewInput): Promise<IpcResult<RenderPreviewOutput>>;
  };
}
