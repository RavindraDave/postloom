/**
 * Settings inheritance (PLAN.md §7.2): the most specific layer that defines a
 * value wins. The app layer is always complete, so every key resolves.
 */
export const SETTINGS_LAYERS = ['send', 'template', 'sender', 'account', 'app'] as const;

export type SettingsLayerName = (typeof SETTINGS_LAYERS)[number];

export interface ResolvedValue<V> {
  value: V;
  /** Which layer supplied the value - shown in the UI ("from Office Gmail account"). */
  source: SettingsLayerName;
}

export type ResolvedSettings<T> = { [K in keyof T]: ResolvedValue<T[K]> };

/** A layer's own values. `undefined` or `null` (a NULL database column) means "inherit". */
export type SettingsOverrides<T> = { [K in keyof T]?: T[K] | null | undefined };

export type SettingsLayers<T> = { app: T } & {
  [L in Exclude<SettingsLayerName, 'app'>]?: SettingsOverrides<T> | undefined;
};

export function resolveSettings<T extends object>(layers: SettingsLayers<T>): ResolvedSettings<T> {
  const keys = Object.keys(layers.app) as (keyof T)[];
  const resolved = {} as ResolvedSettings<T>;

  for (const key of keys) {
    for (const layerName of SETTINGS_LAYERS) {
      const layer: SettingsOverrides<T> | undefined = layers[layerName];
      const value = layer?.[key];
      if (value !== undefined && value !== null) {
        resolved[key] = { value, source: layerName };
        break;
      }
    }
  }

  return resolved;
}
