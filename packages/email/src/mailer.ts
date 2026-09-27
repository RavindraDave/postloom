import { AppError } from '@postloom/core';
import {
  assertNoHeaderInjection,
  createSmtpTransport,
  toMailOptions,
  type OutgoingEmail,
  type RenewAccessToken,
  type SendResult,
  type SmtpAccountConfig,
} from './smtp';
import { sendWithGmailApi } from './gmail-api';

/**
 * What a failed send means for the person being emailed (PLAN.md §9):
 * - `retry`: the server said "not now" (4xx) and took nothing; safe to try again.
 * - `offline`: couldn't connect at all; nothing was sent; safe to try again.
 * - `auth`: the password stopped working; nothing was sent.
 * - `rejected`: the server refused this email for good (5xx, e.g. no such mailbox).
 * - `invalid`: the email itself can't be sent (e.g. a line break in a header).
 * - `uncertain`: the connection failed part-way; the server may have taken it.
 *   Never retried automatically, so nobody gets the same email twice.
 */
export type FailureKind = 'retry' | 'offline' | 'auth' | 'rejected' | 'invalid' | 'uncertain';

export class SendFailure extends Error {
  readonly kind: FailureKind;
  /** A short, non-secret reason for reports (e.g. `550`, `ECONNREFUSED`). */
  readonly reason: string;

  constructor(kind: FailureKind, reason: string, options?: { cause?: unknown }) {
    super(`${kind}: ${reason}`, options);
    this.name = 'SendFailure';
    this.kind = kind;
    this.reason = reason;
  }
}

const BEFORE_SENDING = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EDNS', 'ETLS', 'EAI_AGAIN']);
const AUTH_CODES = new Set(['EAUTH', 'ENOAUTH', 'EOAUTH2']);

/** Sorts a Nodemailer/Node error into what it means for the person being emailed. */
export function classifyFailure(error: unknown): SendFailure {
  if (error instanceof SendFailure) return error;
  if (error instanceof AppError && error.code === 'VALIDATION_FAILED') {
    return new SendFailure('invalid', error.messageKey, { cause: error });
  }
  const field = (name: string): unknown =>
    typeof error === 'object' && error !== null && name in error
      ? (error as Record<string, unknown>)[name]
      : undefined;
  const code = typeof field('code') === 'string' ? (field('code') as string) : '';
  const command = typeof field('command') === 'string' ? (field('command') as string) : '';
  const responseCode =
    typeof field('responseCode') === 'number' ? (field('responseCode') as number) : 0;

  if (
    AUTH_CODES.has(code) ||
    responseCode === 535 ||
    responseCode === 534 ||
    responseCode === 530
  ) {
    return new SendFailure('auth', String(responseCode || code), { cause: error });
  }
  if (responseCode >= 400 && responseCode < 500) {
    return new SendFailure('retry', String(responseCode), { cause: error });
  }
  if (responseCode >= 500) {
    return new SendFailure('rejected', String(responseCode), { cause: error });
  }
  if (BEFORE_SENDING.has(code) || command === 'CONN') {
    return new SendFailure('offline', code || 'CONN', { cause: error });
  }
  return new SendFailure('uncertain', code || 'unknown', { cause: error });
}

export interface Mailer {
  /** Sends one email; throws a `SendFailure` saying what went wrong. */
  send(email: OutgoingEmail): Promise<SendResult>;
  close(): void;
}

/**
 * One connection kept open for a whole send (reconnecting if it drops). For
 * accounts that signed in with Google or Microsoft, `renewAccessToken` gets a
 * fresh token when the current one runs out part-way through a long send.
 */
export function openMailer(config: SmtpAccountConfig, renewAccessToken?: RenewAccessToken): Mailer {
  if (config.via === 'gmail-api') return openGmailApiMailer({ ...config }, renewAccessToken);
  const transport = createSmtpTransport(config, {
    pool: true,
    ...(renewAccessToken ? { renewAccessToken } : {}),
  });
  return {
    async send(email) {
      try {
        assertNoHeaderInjection(email);
        const info = await transport.sendMail(toMailOptions(email));
        return {
          messageId: info.messageId,
          accepted: info.accepted.map(String),
          rejected: info.rejected.map(String),
        };
      } catch (error) {
        throw classifyFailure(error);
      }
    },
    close: () => {
      transport.close();
    },
  };
}

/** The Gmail API has no connection to keep open; each email is one request. */
function openGmailApiMailer(config: SmtpAccountConfig, renew?: RenewAccessToken): Mailer {
  return {
    async send(email) {
      try {
        assertNoHeaderInjection(email);
        // Renew a token that's about to run out before using it.
        if (renew && config.oauth && config.oauth.expiresAt - 60_000 < Date.now()) {
          config.oauth = await renew(false);
        }
        return await sendWithGmailApi(config, email, renew);
      } catch (error) {
        throw classifyFailure(error);
      }
    },
    close: () => undefined,
  };
}
