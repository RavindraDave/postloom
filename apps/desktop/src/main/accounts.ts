import {
  AppError,
  PROVIDER_PRESETS,
  resolveDailyLimitWithSource,
  type EmailAccount,
  type SenderProfile,
} from '@postloom/core';
import type { EmailAccountInfo, SenderInfo } from '@postloom/contracts';
import type { Repositories } from '@postloom/db';
import {
  signatureFromStored,
  signatureToStored,
  writeDocumentToMjml,
  type WriteDocument,
} from '@postloom/editor';
import { compileMjml, sendEmail, verifySmtpAccount, type SmtpAccountConfig } from '@postloom/email';
import { saveSenderBrand, senderBrand } from './brand';
import { appSendingDefaults } from './preferences';
import type { IpcHandlers } from './ipc-router';
import {
  signIn as browserSignIn,
  type OAuthClient,
  type OAuthProvider,
  type SignedIn,
} from './oauth';
import type { AccountTokens } from './oauth-tokens';
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
  /** Google and Microsoft sign-in; without it only passwords are offered. */
  tokens?: AccountTokens | undefined;
  oauth?: OAuthDeps | undefined;
}

type AccountHandlers = Pick<
  IpcHandlers,
  | 'app:getSecurity'
  | 'accounts:list'
  | 'accounts:create'
  | 'accounts:update'
  | 'accounts:delete'
  | 'accounts:testConnection'
  | 'accounts:signIn'
  | 'accounts:signInCancel'
  | 'accounts:signInProviders'
  | 'accounts:test'
  | 'accounts:sendTestEmail'
  | 'senders:list'
  | 'senders:create'
  | 'senders:update'
  | 'senders:delete'
  | 'senders:setBrand'
>;

export interface OAuthDeps {
  /** Signs in in the browser (tests replace it). */
  signIn?: (client: OAuthClient, signal: AbortSignal) => Promise<SignedIn>;
  openBrowser: (url: string) => Promise<void>;
  /** Tests only: a fake Gmail API, and a local SMTP server standing in for Microsoft's. */
  gmailApiBase?: string | undefined;
  microsoftSmtp?: { host: string; port: number } | undefined;
}

/** Where each sign-in's accounts send from. */
function oauthConnection(provider: OAuthProvider, oauth: OAuthDeps | undefined) {
  if (provider === 'google') {
    const preset = PROVIDER_PRESETS.gmail;
    return {
      provider: 'gmail' as const,
      host: preset.host,
      port: preset.port,
      security: preset.security,
    };
  }
  const preset = PROVIDER_PRESETS.outlook;
  return {
    provider: 'outlook' as const,
    host: oauth?.microsoftSmtp?.host ?? preset.host,
    port: oauth?.microsoftSmtp?.port ?? preset.port,
    security: preset.security,
  };
}

/**
 * How to reach an account's email server, with its password or a fresh
 * sign-in token. Secrets are decrypted just in time and never leave the
 * app's own processes.
 */
export async function loadSmtpConfig(
  account: EmailAccount,
  {
    repos,
    vault,
    extraCa,
    tokens,
    oauth,
  }: Pick<AccountDeps, 'repos' | 'vault' | 'extraCa' | 'tokens' | 'oauth'>,
): Promise<SmtpAccountConfig> {
  if (account.auth !== 'password') {
    if (!tokens) {
      throw new AppError({ code: 'EMAIL_AUTH_FAILED', messageKey: 'errors.signInUnavailable' });
    }
    return {
      host: account.host,
      port: account.port,
      security: account.security,
      username: account.username,
      password: '',
      oauth: await tokens.accessToken(account),
      via: account.auth === 'google' ? 'gmail-api' : 'smtp',
      gmailApiBase: oauth?.gmailApiBase,
      extraCa,
    };
  }
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
}

const CONNECTION_FIELDS = ['host', 'port', 'security', 'username'] as const;

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
  tokens,
  oauth,
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
    auth: account.auth,
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

  const savedConfig = (account: EmailAccount) =>
    loadSmtpConfig(account, { repos, vault, extraCa, tokens, oauth });
  let signingIn: AbortController | undefined;

  const toSenderInfo = async (
    sender: SenderProfile,
    accounts: Map<string, EmailAccount>,
  ): Promise<SenderInfo> => {
    const account = accounts.get(sender.emailAccountId);
    const defaults = await appSendingDefaults(repos);
    const delay =
      sender.delayMs !== null
        ? { value: sender.delayMs, source: 'sender' as const }
        : account?.delayMs !== null && account?.delayMs !== undefined
          ? { value: account.delayMs, source: 'account' as const }
          : { value: defaults.delayMs, source: 'app' as const };
    const dailyLimit = resolveDailyLimitWithSource({
      appDefault: defaults.dailyLimit,
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
      signature: signatureFromStored(sender.signature),
      templateCount: await repos.senders.templateCount(sender.id),
      brand: await senderBrand(repos, sender),
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

    // Saving checks the sign-in first, here in the main process: a password
    // that doesn't work is never stored.
    'accounts:create': async ({ password, dailyLimit, delayMs, ...input }) => {
      const { host, port, security, username } = input;
      await smtp.verify({ host, port, security, username, password, extraCa });
      const account = await repos.accounts.create({
        ...input,
        dailyLimit: dailyLimit ?? null,
        delayMs: delayMs ?? null,
      });
      await repos.accounts.setSecret(account.id, vault.encrypt(password));
      await repos.accounts.recordTest(account.id, true);
      return accountInfo(account.id);
    },

    'accounts:update': async ({ id, password, ...rest }) => {
      const changes = definedOnly(rest);
      const connectionChanged =
        password !== undefined || CONNECTION_FIELDS.some((field) => changes[field] !== undefined);
      if (connectionChanged) {
        const current = await repos.accounts.get(id);
        const next = { ...current, ...changes };
        await smtp.verify({
          host: next.host,
          port: next.port,
          security: next.security,
          username: next.username,
          password: password ?? (await savedConfig(current)).password,
          extraCa,
        });
      }
      await repos.accounts.update(id, changes);
      if (password !== undefined) await repos.accounts.setSecret(id, vault.encrypt(password));
      if (connectionChanged) await repos.accounts.recordTest(id, true);
      return accountInfo(id);
    },

    'accounts:delete': async ({ id }) => {
      await repos.accounts.delete(id);
      tokens?.forget(id);
      return { ok: true as const };
    },

    'accounts:signInProviders': () => Promise.resolve(tokens?.providers() ?? []),

    // Signs in in the browser, checks the account can send, then saves it.
    // Signing in again with the same address updates the saved account.
    'accounts:signIn': async ({ provider, accountId, name }) => {
      if (!tokens || !oauth) {
        throw new AppError({ code: 'EMAIL_AUTH_FAILED', messageKey: 'errors.signInUnavailable' });
      }
      signingIn?.abort();
      const controller = new AbortController();
      signingIn = controller;
      let signedIn: SignedIn;
      try {
        signedIn = await (
          oauth.signIn ??
          ((client, signal) => browserSignIn(client, { openBrowser: oauth.openBrowser, signal }))
        )(tokens.client(provider), controller.signal);
      } finally {
        if (signingIn === controller) signingIn = undefined;
      }

      const existing = accountId
        ? await repos.accounts.get(accountId)
        : (await repos.accounts.list()).find(
            (account) => account.auth === provider && account.username === signedIn.email,
          );
      if (existing && existing.username !== signedIn.email) {
        throw new AppError({ code: 'EMAIL_AUTH_FAILED', messageKey: 'errors.signInOtherAddress' });
      }
      const connection = oauthConnection(provider, oauth);
      const access = { accessToken: signedIn.accessToken, expiresAt: signedIn.expiresAt };
      // Microsoft: sign in to the mail server once, so nothing is saved that can't send.
      await smtp.verify({
        ...connection,
        username: signedIn.email,
        password: '',
        oauth: access,
        via: provider === 'google' ? 'gmail-api' : 'smtp',
        extraCa,
      });
      const account = existing
        ? await repos.accounts.update(existing.id, { ...connection, auth: provider })
        : await repos.accounts.create({
            ...connection,
            auth: provider,
            name: name?.trim() || signedIn.email,
            username: signedIn.email,
            dailyLimit: null,
            delayMs: null,
          });
      await repos.accounts.setSecret(account.id, vault.encrypt(signedIn.refreshToken));
      tokens.remember(account.id, access);
      await repos.accounts.recordTest(account.id, true);
      return accountInfo(account.id);
    },

    'accounts:signInCancel': () => {
      signingIn?.abort();
      signingIn = undefined;
      return Promise.resolve({ ok: true as const });
    },

    'accounts:testConnection': async (connection) => {
      await smtp.verify({ ...connection, extraCa });
      return { ok: true as const };
    },

    'accounts:test': async ({ id }) => {
      const account = await repos.accounts.get(id);
      try {
        // A signed-in account checks with its provider that access is still allowed.
        if (account.auth !== 'password') await tokens?.accessToken(account, true);
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
        signature: signatureToStored(input.signature),
      });
      return senderInfo(sender.id);
    },

    'senders:update': async ({ id, signature, ...changes }) => {
      await repos.senders.update(id, {
        ...definedOnly(changes),
        // An empty signature is no signature.
        ...(signature !== undefined && { signature: signatureToStored(signature) }),
      });
      return senderInfo(id);
    },

    'senders:setBrand': async ({ id, brand }) => {
      await saveSenderBrand(repos, await repos.senders.get(id), brand);
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
