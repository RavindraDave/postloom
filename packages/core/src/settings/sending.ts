import { resolveSettings, type ResolvedSettings, type SettingsLayers } from './resolve';

export interface SendingSettings {
  /** Pause between two emails ("Wait between emails"). */
  delayBetweenEmailsMs: number;
  /** Whether a test email to yourself is required before sending. */
  requireTestEmail: boolean;
}

export const DEFAULT_SENDING_SETTINGS: SendingSettings = {
  delayBetweenEmailsMs: 2000,
  requireTestEmail: true,
};

export const DEFAULT_DAILY_LIMIT = 450;

export function resolveSendingSettings(
  layers: SettingsLayers<SendingSettings>,
): ResolvedSettings<SendingSettings> {
  return resolveSettings(layers);
}

export interface DailyLimitInputs {
  appDefault: number;
  /** Limit configured on the Email Account, if any. */
  accountLimit?: number | undefined;
  /** Known limit of the provider preset (e.g. ~500/day for Gmail), if any. */
  providerLimit?: number | undefined;
}

/**
 * The daily limit is a hard ceiling rather than an inherited preference: the
 * strictest of the configured values always wins, so no override can raise it
 * above what the account or provider allows (PLAN.md §7.2).
 */
export function resolveDailyLimit({
  appDefault,
  accountLimit,
  providerLimit,
}: DailyLimitInputs): number {
  const candidates = [appDefault, accountLimit, providerLimit].filter(
    (value): value is number => value !== undefined && Number.isFinite(value) && value >= 0,
  );
  return Math.floor(Math.min(...candidates));
}
