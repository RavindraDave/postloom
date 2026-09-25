import type { AppInfo } from '@postloom/contracts';
import { compileMjml } from '@postloom/email';
import type { IpcHandlers } from './ipc-router';

export function createHandlers(appInfo: AppInfo): IpcHandlers {
  return {
    'app:getInfo': () => Promise.resolve(appInfo),
    'templates:renderPreview': async ({ mjml }) => compileMjml(mjml),
  };
}
