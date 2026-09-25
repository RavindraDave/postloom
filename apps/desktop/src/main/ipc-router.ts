import { toAppErrorShape } from '@postloom/core';
import {
  ipcContract,
  type IpcChannel,
  type IpcInput,
  type IpcOutput,
  type IpcResult,
} from '@postloom/contracts';

export type IpcHandlers = {
  [C in IpcChannel]: (input: IpcInput<C>) => Promise<IpcOutput<C>>;
};

/** The subset of Electron's IpcMainInvokeEvent the router relies on. */
export interface InvokeEvent {
  senderFrame: { url: string; parent: unknown } | null;
}

/** The subset of Electron's ipcMain the router relies on (keeps it unit-testable). */
export interface IpcMainLike {
  handle(channel: string, listener: (event: InvokeEvent, ...args: unknown[]) => unknown): void;
}

export interface IpcRouterOptions {
  isTrustedUrl: (url: string) => boolean;
  onError?: (channel: IpcChannel, error: unknown) => void;
}

/**
 * Registers one handler per channel in the IPC contract. Every request must
 * come from the app's own top-level frame and pass schema validation; every
 * response is validated too, and errors are reduced to safe shapes.
 */
export function registerIpcHandlers(
  ipcMain: IpcMainLike,
  handlers: IpcHandlers,
  options: IpcRouterOptions,
): void {
  for (const channel of Object.keys(ipcContract) as IpcChannel[]) {
    const { input: inputSchema, output: outputSchema } = ipcContract[channel];
    const handler = handlers[channel] as (input: unknown) => Promise<unknown>;

    ipcMain.handle(channel, async (event, rawInput): Promise<IpcResult<unknown>> => {
      const frame = event.senderFrame;
      if (!frame || frame.parent !== null || !options.isTrustedUrl(frame.url)) {
        return { ok: false, error: { code: 'FORBIDDEN', messageKey: 'errors.forbidden' } };
      }

      const parsed = inputSchema.safeParse(rawInput);
      if (!parsed.success) {
        return {
          ok: false,
          error: { code: 'VALIDATION_FAILED', messageKey: 'errors.validationFailed' },
        };
      }

      try {
        const output = outputSchema.parse(await handler(parsed.data));
        return { ok: true, data: output };
      } catch (error) {
        options.onError?.(channel, error);
        return { ok: false, error: toAppErrorShape(error) };
      }
    });
  }
}
