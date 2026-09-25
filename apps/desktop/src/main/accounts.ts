import {
  AppError,
  DEFAULT_DAILY_LIMIT,
  DEFAULT_SENDING_SETTINGS,
  PROVIDER_PRESETS,
  resolveDailyLimitWithSource,
  type EmailAccount,
  type SenderProfile,
} from '@postloom/core';
import type { EmailAccountInfo, SenderInfo } from '@postloom/contracts';
import type { Repositories } from '@postloom/db';
import { writeDocumentToMjml, type WriteDocument } from '@postloom/editor';
import { compileMjml, sendEmail, verifySmtpAccount, type SmtpAccountConfig } from '@postloom/email';
import type { IpcHandlers } from './ipc-router';
import type { SecretVault } from './secrets';

export interface AccountDeps {
  repos: Repositories;
  vault: SecretVault;
  /** Extra trusted CA for local test mail servers (development/tests only). */
  extraCa?: string | undefined;
  smtp?: {
    verify: typeof verifySmtpAccount;
    send: typeof sendEmail;
  };
}

type AccountHandlers = Pick<
  IpcHandlers,
  | 'app:getSecurity'
  | 'accounts:list'
  | 'accounts:create'
  | 'accounts:update'
  | 'accounts:delete'
  | 'accounts:testConnection'
  | 'accounts:test'
  | 'accounts:sendTestEmail'
  | 'senders:list'
  | 'senders:create'
  | 'senders:update'
  | 'senders:delete'
>;

const TEST_EMAIL: WriteDocument = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'It works!' }] },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'This is a test email from Postloom. If you can read it, your email account is connected and ready to send.',
        },
      ],
    },
  ],
};

export function createAccountHandlers({
  repos,
  vault,
  extraCa,
  smtp = { verify: verifySmtpAccount, send: sendEmail },
}: AccountDeps): AccountHandlers {
  const senderCounts = async () => {
    const counts = new Map<string, number>();
    for (const sender of await repos.senders.list()) {
      counts.set(sender.emailAccountId, (counts.get(sender.emailAccountId) ?? 0) + 1);
    }
    return counts;
  };

  const toAccountInfo = (account: EmailAccount, senderCount: number): EmailAccountInfo => ({
    id: account.id,
    name: account.name,
    provider: account.provider,
    host: account.host,
    port: account.port,
    security: account.security,
    username: account.username,
    hasPassword: account.hasSecret,
    dailyLimit: account.dailyLimit,
    delayMs: account.delayMs,
    lastTestedAt: account.lastTestedAt,
    lastTestOk: account.lastTestOk,
    senderCount,
  });

  const accountInfo = async (id: string) => {
    const account = await repos.accounts.get(id);
    return toAccountInfo(account, (await senderCounts()).get(id) ?? 0);
  };

  /** Decrypts the saved password just in time; it never leaves the main process. */
  const savedConfig = async (account: EmailAccount): Promise<SmtpAccountConfig> => {
    const cipher = await repos.accounts.getSecret(account.id);
    if (!cipher) {
      throw new AppError({ code: 'EMAIL_AUTH_FAILED', messageKey: 'errors.passwordMissing' });
    }
    return {
      host: account.host,
      port: account.port,
      security: account.security,
      username: account.username,
      password: vault.decrypt(cipher),
      extraCa,
    };
  };

  const toSenderInfo = async (
    sender: SenderProfile,
    accounts: Map<string, EmailAccount>,
  ): Promise<SenderInfo> => {
    const account = accounts.get(sender.emailAccountId);
    const delay =
      sender.delayMs !== null
        ? { value: sender.delayMs, source: 'sender' as const }
        : account?.delayMs !== null && account?.delayMs !== undefined
          ? { value: account.delayMs, source: 'account' as const }
          : { value: DEFAULT_SENDING_SETTINGS.delayBetweenEmailsMs, source: 'app' as const };
    const dailyLimit = resolveDailyLimitWithSource({
      appDefault: DEFAULT_DAILY_LIMIT,
      accountLimit: account?.dailyLimit ?? undefined,
      providerLimit: account
        ? (PROVIDER_PRESETS[account.provider].dailyLimit ?? undefined)
        : undefined,
    });
    return {
      id: sender.id,
      name: sender.name,
      emailAccountId: sender.emailAccountId,
      fromName: sender.fromName,
      fromAddress: sender.fromAddress,
      replyTo: sender.replyTo,
      delayMs: sender.delayMs,
      templateCount: await repos.senders.templateCount(sender.id),
      effective: { delayMs: delay, dailyLimit },
    };
  };

  const senderInfo = async (id: string) => {
    const accounts = new Map((await repos.accounts.list()).map((a) => [a.id, a]));
    return toSenderInfo(await repos.senders.get(id), accounts);
  };

  return {
    'app:getSecurity': () => Promise.resolve({ secretProtection: vault.protection() }),

    'accounts:list': async () => {
      const counts = await senderCounts();
      return (await repos.accounts.list()).map((a) => toAccountInfo(a, counts.get(a.id) ?? 0));
    },

    'accounts:create': async ({ password, dailyLimit, delayMs, ...input }) => {
      const account = await repos.accounts.create({
        ...input,
        dailyLimit: dailyLimit ?? null,
        delayMs: delayMs ?? null,
      });
      await repos.accounts.setSecret(account.id, vault.encrypt(password));
      return accountInfo(account.id);
    },

    'accounts:update': async ({ id, password, ...changes }) => {
      await repos.accounts.update(id, definedOnly(changes));
      if (password !== undefined) await repos.accounts.setSecret(id, vault.encrypt(password));
      return accountInfo(id);
    },

    'accounts:delete': async ({ id }) => {
      await repos.accounts.delete(id);
      return { ok: true as const };
    },

    'accounts:testConnection': async (connection) => {
      await smtp.verify({ ...connection, extraCa });
      return { ok: true as const };
    },

    'accounts:test': async ({ id }) => {
      const account = await repos.accounts.get(id);
      try {
        await smtp.verify(await savedConfig(account));
        await repos.accounts.recordTest(id, true);
      } catch (error) {
        await repos.accounts.recordTest(id, false);
        throw error;
      }
      return accountInfo(id);
    },

    'accounts:sendTestEmail': async ({ id, to }) => {
      const account = await repos.accounts.get(id);
      const recipient = to ?? account.username;
      const { html, text } = await compileMjml(writeDocumentToMjml(TEST_EMAIL));
      await smtp.send(await savedConfig(account), {
        from: { name: 'Postloom', address: account.username },
        to: [recipient],
        subject: 'Postloom test email',
        html,
        text,
      });
      await repos.accounts.recordTest(id, true);
      return { sentTo: recipient };
    },

    'senders:list': async () => {
      const accounts = new Map((await repos.accounts.list()).map((a) => [a.id, a]));
      return Promise.all((await repos.senders.list()).map((s) => toSenderInfo(s, accounts)));
    },

    'senders:create': async (input) => {
      const sender = await repos.senders.create({
        name: input.name,
        emailAccountId: input.emailAccountId,
        fromName: input.fromName,
        fromAddress: input.fromAddress,
        replyTo: input.replyTo ?? null,
        defaultCc: null,
        defaultBcc: null,
        brandKitId: null,
        delayMs: input.delayMs ?? null,
      });
      return senderInfo(sender.id);
    },

    'senders:update': async ({ id, ...changes }) => {
      await repos.senders.update(id, definedOnly(changes));
      return senderInfo(id);
    },

    'senders:delete': async ({ id }) => {
      await repos.senders.delete(id);
      return { ok: true as const };
    },
  };
}

type DefinedOnly<T> = { [K in keyof T]?: Exclude<T[K], undefined> };

/** Drops fields that weren't given, so an update only changes what the person edited. */
function definedOnly<T extends object>(changes: T): DefinedOnly<T> {
  return Object.fromEntries(
    Object.entries(changes).filter(([, value]) => value !== undefined),
  ) as DefinedOnly<T>;
}
