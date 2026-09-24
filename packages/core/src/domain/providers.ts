import type { ConnectionSecurity, ProviderId } from './entities';

export interface ProviderPreset {
  id: ProviderId;
  /** Shown on the setup tile. */
  label: string;
  host: string;
  port: number;
  security: ConnectionSecurity;
  /**
   * Approximate daily sending limit for personal accounts. Providers change
   * these without notice, so treat them as a safety ceiling, not a promise.
   */
  dailyLimit: number | null;
  /** Whether the provider needs a separate "app password" for apps like Postloom. */
  needsAppPassword: boolean;
  /** i18n key of the step-by-step help for this provider. */
  helpKey: string;
}

export const PROVIDER_PRESETS: Readonly<Record<ProviderId, ProviderPreset>> = {
  gmail: {
    id: 'gmail',
    label: 'Gmail',
    host: 'smtp.gmail.com',
    port: 587,
    security: 'starttls',
    dailyLimit: 500,
    needsAppPassword: true,
    helpKey: 'help.providers.gmail',
  },
  outlook: {
    id: 'outlook',
    label: 'Outlook',
    host: 'smtp-mail.outlook.com',
    port: 587,
    security: 'starttls',
    dailyLimit: 300,
    needsAppPassword: true,
    helpKey: 'help.providers.outlook',
  },
  yahoo: {
    id: 'yahoo',
    label: 'Yahoo Mail',
    host: 'smtp.mail.yahoo.com',
    port: 465,
    security: 'tls',
    dailyLimit: 500,
    needsAppPassword: true,
    helpKey: 'help.providers.yahoo',
  },
  zoho: {
    id: 'zoho',
    label: 'Zoho Mail',
    host: 'smtp.zoho.com',
    port: 465,
    security: 'tls',
    dailyLimit: null,
    needsAppPassword: true,
    helpKey: 'help.providers.zoho',
  },
  icloud: {
    id: 'icloud',
    label: 'iCloud Mail',
    host: 'smtp.mail.me.com',
    port: 587,
    security: 'starttls',
    dailyLimit: 1000,
    needsAppPassword: true,
    helpKey: 'help.providers.icloud',
  },
  other: {
    id: 'other',
    label: 'Something else',
    host: '',
    port: 587,
    security: 'starttls',
    dailyLimit: null,
    needsAppPassword: false,
    helpKey: 'help.providers.other',
  },
};

export const PROVIDER_IDS = Object.keys(PROVIDER_PRESETS) as ProviderId[];

/** Suggests a provider from an email address, e.g. "asha@gmail.com" → gmail. */
export function guessProvider(emailAddress: string): ProviderId {
  const domain = emailAddress.trim().toLowerCase().split('@')[1] ?? '';
  if (domain === 'gmail.com' || domain === 'googlemail.com') return 'gmail';
  if (['outlook.com', 'hotmail.com', 'live.com', 'msn.com'].includes(domain)) return 'outlook';
  if (domain.startsWith('yahoo.') || domain === 'ymail.com' || domain === 'aol.com') return 'yahoo';
  if (domain === 'zoho.com' || domain === 'zohomail.com') return 'zoho';
  if (['icloud.com', 'me.com', 'mac.com'].includes(domain)) return 'icloud';
  return 'other';
}
