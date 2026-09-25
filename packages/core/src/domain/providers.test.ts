import { describe, expect, it } from 'vitest';
import { guessProvider, PROVIDER_IDS, PROVIDER_PRESETS } from './providers';

describe('provider presets', () => {
  it('has a complete preset for every provider', () => {
    for (const id of PROVIDER_IDS) {
      const preset = PROVIDER_PRESETS[id];
      expect(preset.id).toBe(id);
      expect(preset.port).toBeGreaterThan(0);
      expect(preset.helpKey).toMatch(/^help\.providers\./);
      if (id !== 'other') expect(preset.host).toMatch(/^smtp[\w.-]*\.[a-z]+$/);
    }
  });

  it('uses encrypted connections on the standard ports', () => {
    for (const preset of Object.values(PROVIDER_PRESETS)) {
      expect(preset.port).toBe(preset.security === 'tls' ? 465 : 587);
    }
  });
});

describe('guessProvider', () => {
  it.each([
    ['asha@gmail.com', 'gmail'],
    ['Asha@GoogleMail.com ', 'gmail'],
    ['a@hotmail.com', 'outlook'],
    ['a@yahoo.co.in', 'yahoo'],
    ['a@aol.com', 'yahoo'],
    ['a@zohomail.com', 'zoho'],
    ['a@me.com', 'icloud'],
    ['accounts@brightlane.example', 'other'],
    ['not-an-address', 'other'],
  ] as const)('%s → %s', (address, expected) => {
    expect(guessProvider(address)).toBe(expected);
  });
});
