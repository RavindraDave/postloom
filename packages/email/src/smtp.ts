import { AppError } from '@postloom/core';
import nodemailer from 'nodemailer';

export interface SmtpAccountConfig {
  host: string;
  port: number;
  /** `tls`: encrypted from the start (usually port 465). `starttls`: upgrade after connecting (usually 587). */
  security: 'tls' | 'starttls';
  username: string;
  password: string;
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

/** Creates a Nodemailer transport that always requires an encrypted, verified connection. */
export function createSmtpTransport(config: SmtpAccountConfig, { pool = false } = {}) {
  const timeout = config.connectionTimeoutMs ?? 20_000;
  return nodemailer.createTransport({
    // A pool keeps one connection open across a whole send and reconnects if it drops.
    ...(pool ? { pool: true as const, maxConnections: 1, maxMessages: 100 } : {}),
    host: config.host,
    port: config.port,
    secure: config.security === 'tls',
    requireTLS: true,
    auth: { user: config.username, pass: config.password },
    connectionTimeout: timeout,
    greetingTimeout: timeout,
    socketTimeout: timeout * 3,
    tls: {
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2',
      ...(config.extraCa ? { ca: [config.extraCa] } : {}),
    },
  });
}

/** Connects and signs in without sending anything ("Test connection"). */
export async function verifySmtpAccount(config: SmtpAccountConfig): Promise<void> {
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

const AUTH_CODES = new Set(['EAUTH', 'ENOAUTH']);
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
