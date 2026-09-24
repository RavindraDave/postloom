import { describe, expect, it } from 'vitest';
import { IPC_CHANNELS, ipcContract, MAX_TEMPLATE_SOURCE_LENGTH } from './ipc';

describe('ipcContract', () => {
  it('uses "<area>:<action>" channel names', () => {
    for (const channel of IPC_CHANNELS) {
      expect(channel).toMatch(/^[a-z]+:[a-zA-Z]+$/);
    }
  });

  it('rejects oversized or empty template sources', () => {
    const schema = ipcContract['templates:renderPreview'].input;

    expect(schema.safeParse({ mjml: '' }).success).toBe(false);
    expect(schema.safeParse({ mjml: 'x'.repeat(MAX_TEMPLATE_SOURCE_LENGTH + 1) }).success).toBe(
      false,
    );
    expect(schema.safeParse({ mjml: '<mjml></mjml>' }).success).toBe(true);
  });

  it('rejects unexpected input for channels without input', () => {
    expect(ipcContract['app:getInfo'].input.safeParse({ path: '/etc/passwd' }).success).toBe(false);
  });
});
