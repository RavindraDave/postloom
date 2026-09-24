import { AppError } from '@postloom/core';
import { IPC_CHANNELS } from '@postloom/contracts';
import { describe, expect, it, vi } from 'vitest';
import {
  registerIpcHandlers,
  type IpcHandlers,
  type IpcMainLike,
  type InvokeEvent,
} from './ipc-router';

type Listener = (event: InvokeEvent, ...args: unknown[]) => unknown;

function setup(overrides: Partial<IpcHandlers> = {}) {
  const listeners = new Map<string, Listener>();
  const ipcMain: IpcMainLike = { handle: (channel, listener) => listeners.set(channel, listener) };
  // Channels a test doesn't care about reject, so accidental use is visible.
  const notUsed = Object.fromEntries(
    IPC_CHANNELS.map((channel) => [
      channel,
      () => Promise.reject(new Error(`${channel} not stubbed`)),
    ]),
  ) as unknown as IpcHandlers;
  const handlers: IpcHandlers = {
    ...notUsed,
    'app:getInfo': async () => ({ name: 'Postloom', version: '0.1.0', platform: 'linux' }),
    'templates:renderPreview': async () => ({ html: '<p>Hi</p>', text: 'Hi', warnings: [] }),
    ...overrides,
  };
  const onError = vi.fn();
  registerIpcHandlers(ipcMain, handlers, {
    isTrustedUrl: (url) => url.startsWith('app://postloom/'),
    onError,
  });

  const call = (channel: string, input?: unknown, frame: InvokeEvent['senderFrame'] = appFrame) =>
    listeners.get(channel)!({ senderFrame: frame }, input);
  return { listeners, call, onError };
}

const appFrame = { url: 'app://postloom/index.html', parent: null };

describe('registerIpcHandlers', () => {
  it('registers exactly the channels in the contract', () => {
    const { listeners } = setup();
    expect([...listeners.keys()].sort()).toEqual([...IPC_CHANNELS].sort());
    expect(listeners.has('templates:list')).toBe(true);
  });

  it('returns handler output for valid requests from the app', async () => {
    const { call } = setup();
    await expect(call('app:getInfo')).resolves.toEqual({
      ok: true,
      data: { name: 'Postloom', version: '0.1.0', platform: 'linux' },
    });
  });

  it('rejects requests from untrusted pages and from sub-frames', async () => {
    const { call } = setup();
    const forbidden = { ok: false, error: { code: 'FORBIDDEN', messageKey: 'errors.forbidden' } };

    await expect(
      call('app:getInfo', undefined, { url: 'https://attacker.example', parent: null }),
    ).resolves.toEqual(forbidden);
    await expect(
      call('app:getInfo', undefined, { url: 'app://postloom/index.html', parent: {} }),
    ).resolves.toEqual(forbidden);
    await expect(call('app:getInfo', undefined, null)).resolves.toEqual(forbidden);
  });

  it('rejects invalid input without calling the handler', async () => {
    const renderPreview = vi.fn();
    const { call } = setup({ 'templates:renderPreview': renderPreview });

    await expect(call('templates:renderPreview', { mjml: 42 })).resolves.toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_FAILED' },
    });
    expect(renderPreview).not.toHaveBeenCalled();
  });

  it('passes app errors through and hides unexpected ones', async () => {
    const appError = setup({
      'templates:renderPreview': async () => {
        throw new AppError({ code: 'TEMPLATE_INVALID', messageKey: 'errors.templateInvalid' });
      },
    });
    await expect(appError.call('templates:renderPreview', { mjml: '<mjml/>' })).resolves.toEqual({
      ok: false,
      error: { code: 'TEMPLATE_INVALID', messageKey: 'errors.templateInvalid' },
    });

    const unexpected = setup({
      'templates:renderPreview': async () => {
        throw new Error('secret details');
      },
    });
    const result = await unexpected.call('templates:renderPreview', { mjml: '<mjml/>' });
    expect(result).toEqual({
      ok: false,
      error: { code: 'UNEXPECTED', messageKey: 'errors.unexpected' },
    });
    expect(unexpected.onError).toHaveBeenCalledOnce();
  });

  it('rejects handler output that does not match the contract', async () => {
    const { call } = setup({
      'app:getInfo': async () => ({ name: 'Postloom', version: '1', platform: 'plan9' }) as never,
    });
    await expect(call('app:getInfo')).resolves.toMatchObject({
      ok: false,
      error: { code: 'UNEXPECTED' },
    });
  });
});
