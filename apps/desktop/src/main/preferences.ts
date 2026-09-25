import { DEFAULT_PREFERENCES, preferencesSchema, type Preferences } from '@postloom/contracts';
import type { Repositories } from '@postloom/db';

export const PREFERENCES_KEY = 'preferences';

/** The saved preferences, over the defaults; anything invalid (e.g. from an older version) is dropped. */
export async function loadPreferences(repos: Repositories): Promise<Preferences> {
  const raw = await repos.settings.get<unknown>(PREFERENCES_KEY, {});
  const stored = typeof raw === 'object' && raw !== null ? raw : {};
  const merged = preferencesSchema.safeParse({ ...DEFAULT_PREFERENCES, ...stored });
  if (merged.success) return merged.data;
  // Keep what is still valid, one setting at a time.
  const kept: Record<string, unknown> = { ...DEFAULT_PREFERENCES };
  for (const [key, value] of Object.entries(stored)) {
    const shape = preferencesSchema.shape[key as keyof Preferences] as
      (typeof preferencesSchema.shape)[keyof Preferences] | undefined;
    if (shape?.safeParse(value).success) kept[key] = value;
  }
  return preferencesSchema.parse(kept);
}

/** Postloom's own sending defaults (the "app" level of PLAN.md §7.2). */
export async function appSendingDefaults(
  repos: Repositories,
): Promise<{ delayMs: number; dailyLimit: number }> {
  const { delayMs, dailyLimit } = await loadPreferences(repos);
  return { delayMs, dailyLimit };
}
