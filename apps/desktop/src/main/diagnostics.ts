import type { AppInfo, Preferences, SecretProtection } from '@postloom/contracts';
import type { Repositories } from '@postloom/db';

export interface DiagnosticsInputs {
  appInfo: AppInfo;
  runtime: { electron: string; chrome: string; node: string; arch: string; osRelease: string };
  secretProtection: SecretProtection;
  preferences: Preferences;
  backups: number;
  now?: () => Date;
}

const countBy = <T>(items: T[], key: (item: T) => string) => {
  const counts: Record<string, number> = {};
  for (const item of items) counts[key(item)] = (counts[key(item)] ?? 0) + 1;
  return counts;
};

/**
 * A file for support: the version, the computer and how Postloom is set up.
 * Only counts and settings - never passwords, email addresses, server
 * names, names of people, template content or lists.
 */
export async function buildDiagnostics(repos: Repositories, inputs: DiagnosticsInputs) {
  const accounts = await repos.accounts.list();
  const sends = await repos.sends.list();
  const recent = sends.slice(0, 10);
  return {
    generatedAt: (inputs.now ?? (() => new Date()))().toISOString(),
    app: inputs.appInfo,
    runtime: inputs.runtime,
    passwordStore: inputs.secretProtection,
    preferences: inputs.preferences,
    accounts: {
      count: accounts.length,
      byProvider: countBy(accounts, (account) => account.provider),
      bySecurity: countBy(accounts, (account) => account.security),
      withPassword: accounts.filter((account) => account.hasSecret).length,
      lastTestFailed: accounts.filter((account) => account.lastTestOk === false).length,
    },
    senders: (await repos.senders.list()).length,
    templates: (await repos.templates.list()).length,
    sends: {
      count: sends.length,
      byStatus: countBy(sends, (send) => send.status),
      recent: await Promise.all(
        recent.map(async (send) => ({
          status: send.status,
          pauseReason: send.pauseReason,
          createdAt: send.createdAt,
          settings: send.settings,
          people: await repos.sends.counts(send.id),
          // Reason codes only (e.g. "rejected:550"), never who they were for.
          problems: countBy(
            (await repos.sends.recipients(send.id)).filter((person) => person.errorCode),
            (person) => person.errorCode ?? '',
          ),
        })),
      ),
    },
    backups: inputs.backups,
  };
}
