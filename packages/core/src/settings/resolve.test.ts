import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { resolveSettings, SETTINGS_LAYERS, type SettingsLayers } from './resolve';

interface Example {
  delay: number;
  replyTo: string;
}

const app: Example = { delay: 1000, replyTo: 'app@example.com' };

describe('resolveSettings', () => {
  it('uses app defaults when no other layer defines a value', () => {
    expect(resolveSettings<Example>({ app })).toEqual({
      delay: { value: 1000, source: 'app' },
      replyTo: { value: 'app@example.com', source: 'app' },
    });
  });

  it('prefers the most specific layer that defines each key', () => {
    const resolved = resolveSettings<Example>({
      app,
      account: { delay: 3000 },
      sender: { replyTo: 'sender@example.com' },
      send: { delay: 5000 },
    });

    expect(resolved.delay).toEqual({ value: 5000, source: 'send' });
    expect(resolved.replyTo).toEqual({ value: 'sender@example.com', source: 'sender' });
  });

  it('treats undefined and null as "inherit" but keeps falsy values such as 0', () => {
    const resolved = resolveSettings<Example>({
      app,
      send: { delay: null },
      template: { delay: undefined },
      sender: { delay: 0 },
    });

    expect(resolved.delay).toEqual({ value: 0, source: 'sender' });
  });

  it('always resolves to the first defining layer in priority order (property)', () => {
    const layerValue = fc.option(fc.integer(), { nil: undefined });
    fc.assert(
      fc.property(
        fc.record({
          send: layerValue,
          template: layerValue,
          sender: layerValue,
          account: layerValue,
          app: fc.integer(),
        }),
        (values) => {
          const layers: SettingsLayers<{ delay: number }> = { app: { delay: values.app } };
          for (const name of SETTINGS_LAYERS) {
            if (name !== 'app') {
              layers[name] = { delay: values[name] };
            }
          }

          const expectedSource = SETTINGS_LAYERS.find((name) => values[name] !== undefined);
          const resolved = resolveSettings(layers).delay;

          expect(resolved.source).toBe(expectedSource);
          expect(resolved.value).toBe(values[expectedSource ?? 'app']);
        },
      ),
    );
  });
});
