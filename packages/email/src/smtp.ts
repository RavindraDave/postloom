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
  subject: string;
  html: string;
  text: string;
}

export interface SendResult {
  messageId: string;
  accepted: string[];
  rejected: string[];
}

const HEADER_BREAK = /[\r\n]/;

/** Creates a Nodemailer transport that always requires an encrypted, verified connection. */
export function createSmtpTransport(config: SmtpAccountConfig) {
  const timeout = config.connectionTimeoutMs ?? 20_000;
  return nodemailer.createTransport({
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
    const info = await transport.sendMail({
      from: email.from.name
        ? { name: email.from.name, address: email.from.address }
        : email.from.address,
      to: email.to,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
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

/** Values that end up in email headers must never contain line breaks (PLAN.md §10.4). */
export function assertNoHeaderInjection(email: OutgoingEmail): void {
  const headerValues = [email.subject, email.from.name ?? '', email.from.address, ...email.to];
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
