import { describe, expect, it } from 'vitest';
import { DEFAULT_SENDING_SETTINGS, resolveDailyLimit, resolveSendingSettings } from './sending';

describe('resolveDailyLimit', () => {
  it('uses the app default when nothing stricter is configured', () => {
    expect(resolveDailyLimit({ appDefault: 450 })).toBe(450);
  });

  it('never exceeds the account or provider limit', () => {
    expect(resolveDailyLimit({ appDefault: 1000, accountLimit: 300, providerLimit: 500 })).toBe(
      300,
    );
    expect(resolveDailyLimit({ appDefault: 1000, accountLimit: 800, providerLimit: 500 })).toBe(
      500,
    );
  });

  it('ignores invalid values', () => {
    expect(
      resolveDailyLimit({ appDefault: 450, accountLimit: Number.NaN, providerLimit: -1 }),
    ).toBe(450);
  });
});

describe('resolveSendingSettings', () => {
  it('lets a send override the delay but reports the source', () => {
    const resolved = resolveSendingSettings({
      app: DEFAULT_SENDING_SETTINGS,
      account: { delayBetweenEmailsMs: 5000 },
      send: { requireTestEmail: false },
    });

    expect(resolved.delayBetweenEmailsMs).toEqual({ value: 5000, source: 'account' });
    expect(resolved.requireTestEmail).toEqual({ value: false, source: 'send' });
  });
});
