import { AppError } from '@postloom/core';
import nodemailer from 'nodemailer';
import { sendWithGmailApi } from './gmail-api';

export interface SmtpAccountConfig {
  host: string;
  port: number;
  /** `tls`: encrypted from the start (usually port 465). `starttls`: upgrade after connecting (usually 587). */
  security: 'tls' | 'starttls';
  username: string;
  /** The password or app password; empty for accounts that sign in with Google or Microsoft. */
  password: string;
  /**
   * A Google or Microsoft sign-in (OAuth) access token, used instead of the
   * password: over SMTP (XOAUTH2) for Microsoft, or with the Gmail API.
   */
  oauth?: { accessToken: string; expiresAt: number } | undefined;
  /** How emails leave: over SMTP (the default), or through the Gmail API (Google sign-in). */
  via?: 'smtp' | 'gmail-api' | undefined;
  /** The Gmail API's address; only tests change it. */
  gmailApiBase?: string | undefined;
  /**
   * Extra trusted certificate authorities (PEM), e.g. a company's own CA.
   * Certificate verification itself can never be turned off.
   */
  extraCa?: string | undefined;
  connectionTimeoutMs?: number | undefined;
}

export interface OutgoingEmail {
  from: { name?: string | undefined; address: string };
  to: string[];
  cc?: string[] | undefined;
  bcc?: string[] | undefined;
  /** Where replies go, if not the From address. */
  replyTo?: string | undefined;
  subject: string;
  html: string;
  text: string;
  /** Pictures sent inside the email, referenced from the HTML as `cid:<cid>`. */
  inlineImages?: InlineImage[] | undefined;
  /** Files attached to the email. */
  attachments?: FileAttachment[] | undefined;
}

export interface FileAttachment {
  filename: string;
  content: Uint8Array;
}

export interface InlineImage {
  cid: string;
  contentType: string;
  content: Uint8Array;
  filename: string;
}

export interface SendResult {
  messageId: string;
  accepted: string[];
  rejected: string[];
}

const HEADER_BREAK = /[\r\n]/;

/** Gets a fresh sign-in token (renew: the current one was refused). */
export type RenewAccessToken = (
  renew: boolean,
) => Promise<{ accessToken: string; expiresAt: number }>;

/** Creates a Nodemailer transport that always requires an encrypted, verified connection. */
export function createSmtpTransport(
  config: SmtpAccountConfig,
  { pool = false, renewAccessToken }: { pool?: boolean; renewAccessToken?: RenewAccessToken } = {},
) {
  const timeout = config.connectionTimeoutMs ?? 20_000;
  const transport = nodemailer.createTransport({
    // A pool keeps one connection open across a whole send and reconnects if it drops.
    ...(pool ? { pool: true as const, maxConnections: 1, maxMessages: 100 } : {}),
    host: config.host,
    port: config.port,
    secure: config.security === 'tls',
    requireTLS: true,
    auth: config.oauth
      ? {
          type: 'OAuth2' as const,
          user: config.username,
          accessToken: config.oauth.accessToken,
          expires: config.oauth.expiresAt,
        }
      : { user: config.username, pass: config.password },
    connectionTimeout: timeout,
    greetingTimeout: timeout,
    socketTimeout: timeout * 3,
    tls: {
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2',
      ...(config.extraCa ? { ca: [config.extraCa] } : {}),
    },
  });
  if (config.oauth && renewAccessToken) {
    // A long send outlives its token: ask for a new one when it expires or is refused.
    transport.set('oauth2_provision_cb', (_user, renew, callback) => {
      renewAccessToken(renew).then(
        (token) => {
          callback(null, token.accessToken, token.expiresAt);
        },
        (error: unknown) => {
          callback(error instanceof Error ? error : new Error('Sign-in failed'));
        },
      );
    });
  }
  return transport;
}

/** Connects and signs in without sending anything ("Test connection"). */
export async function verifySmtpAccount(config: SmtpAccountConfig): Promise<void> {
  // The Gmail API has no "sign in only" call with the send-only permission;
  // getting the token was the check.
  if (config.via === 'gmail-api') return;
  const transport = createSmtpTransport(config);
  try {
    await transport.verify();
  } catch (error) {
    throw toEmailError(error);
  } finally {
    transport.close();
  }
}

export async function sendEmail(
  config: SmtpAccountConfig,
  email: OutgoingEmail,
): Promise<SendResult> {
  assertNoHeaderInjection(email);
  if (config.via === 'gmail-api') {
    try {
      return await sendWithGmailApi(config, email);
    } catch (error) {
      throw toEmailError(error);
    }
  }
  const transport = createSmtpTransport(config);
  try {
    const info = await transport.sendMail(toMailOptions(email));
    return {
      messageId: info.messageId,
      accepted: info.accepted.map(String),
      rejected: info.rejected.map(String),
    };
  } catch (error) {
    throw toEmailError(error);
  } finally {
    transport.close();
  }
}

/** Nodemailer's message options for an email (after the header check). */
export function toMailOptions(email: OutgoingEmail) {
  return {
    from: email.from.name
      ? { name: email.from.name, address: email.from.address }
      : email.from.address,
    to: email.to,
    ...(email.cc?.length ? { cc: email.cc } : {}),
    ...(email.bcc?.length ? { bcc: email.bcc } : {}),
    ...(email.replyTo ? { replyTo: email.replyTo } : {}),
    subject: email.subject,
    html: email.html,
    text: email.text,
    ...(email.inlineImages?.length || email.attachments?.length
      ? {
          attachments: [
            ...(email.inlineImages ?? []).map((image) => ({
              cid: image.cid,
              contentType: image.contentType,
              content: Buffer.from(image.content),
              filename: image.filename,
              contentDisposition: 'inline' as const,
            })),
            ...(email.attachments ?? []).map((file) => ({
              filename: file.filename,
              content: Buffer.from(file.content),
              contentDisposition: 'attachment' as const,
            })),
          ],
        }
      : {}),
  };
}

/** Values that end up in email headers must never contain line breaks (PLAN.md §10.4). */
export function assertNoHeaderInjection(email: OutgoingEmail): void {
  const headerValues = [
    email.subject,
    email.from.name ?? '',
    email.from.address,
    email.replyTo ?? '',
    ...email.to,
    ...(email.cc ?? []),
    ...(email.bcc ?? []),
    ...(email.attachments ?? []).map((file) => file.filename),
  ];
  if (headerValues.some((value) => HEADER_BREAK.test(value))) {
    throw new AppError({
      code: 'VALIDATION_FAILED',
      messageKey: 'errors.headerLineBreak',
    });
  }
}

const AUTH_CODES = new Set(['EAUTH', 'ENOAUTH', 'EOAUTH2']);
const CONNECTION_CODES = new Set([
  'ECONNECTION',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ESOCKET',
  'EDNS',
  'ENOTFOUND',
  'ETLS',
  'EPROTOCOL',
]);

/** Maps Nodemailer/Node errors to user-facing error codes, without leaking server responses. */
export function toEmailError(error: unknown): AppError {
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  const responseCode =
    typeof error === 'object' && error !== null && 'responseCode' in error
      ? Number(error.responseCode)
      : undefined;

  if (AUTH_CODES.has(code) || responseCode === 535 || responseCode === 534) {
    return new AppError(
      { code: 'EMAIL_AUTH_FAILED', messageKey: 'errors.emailAuthFailed' },
      { cause: error },
    );
  }
  if (CONNECTION_CODES.has(code)) {
    return new AppError(
      {
        code: 'EMAIL_CONNECTION_FAILED',
        messageKey: 'errors.emailConnectionFailed',
        details: { reason: code },
      },
      { cause: error },
    );
  }
  return new AppError(
    {
      code: 'UNEXPECTED',
      messageKey: 'errors.emailSendFailed',
      ...(responseCode ? { details: { responseCode } } : {}),
    },
    { cause: error },
  );
}
