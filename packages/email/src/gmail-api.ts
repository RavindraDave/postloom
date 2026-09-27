import MailComposer from 'nodemailer/lib/mail-composer';
import {
  toMailOptions,
  type OutgoingEmail,
  type RenewAccessToken,
  type SendResult,
  type SmtpAccountConfig,
} from './smtp';

/**
 * Sending through the Gmail API, for accounts that signed in with Google.
 * Google only lets apps send over SMTP with a "restricted" permission that
 * needs a yearly security audit; the Gmail API's send-only permission
 * (`gmail.send`) doesn't. The email is built exactly as for SMTP and handed
 * over whole, so it arrives the same way (and appears in Gmail's Sent).
 */

export const GMAIL_API_BASE = 'https://gmail.googleapis.com';

/** Emails over this size are refused by the Gmail API's simple upload. */
const MAX_UPLOAD_BYTES = 35 * 1024 * 1024;
const TIMEOUT_MS = 120_000;
const NOTHING_SENT = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNECTION']);

/**
 * A Gmail API failure, shaped like a Nodemailer error (`code`, `responseCode`)
 * so the same rules decide what it means for the person being emailed.
 */
export class GmailApiError extends Error {
  readonly code: string;
  readonly responseCode: number | undefined;

  constructor(message: string, code: string, responseCode?: number) {
    super(message);
    this.name = 'GmailApiError';
    this.code = code;
    this.responseCode = responseCode;
  }
}

/** The whole email as it would go over SMTP, Bcc included (Gmail removes it before delivery). */
async function rawMessage(email: OutgoingEmail): Promise<Buffer> {
  const node = new MailComposer(toMailOptions(email)).compile();
  node.keepBcc = true;
  return node.build();
}

async function upload(base: string, accessToken: string, raw: Buffer): Promise<Response> {
  try {
    return await fetch(`${base}/upload/gmail/v1/users/me/messages/send?uploadType=media`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'message/rfc822' },
      body: new Uint8Array(raw),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    // Couldn't connect: nothing was sent. Anything else (a timeout, a dropped
    // connection) happened after Google may have taken the email.
    const cause = (error as { cause?: { code?: unknown } }).cause;
    const code = typeof cause?.code === 'string' ? cause.code : '';
    throw new GmailApiError(
      'Gmail API request failed',
      NOTHING_SENT.has(code) ? 'ECONNREFUSED' : 'ETIMEDOUT',
    );
  }
}

/** What an HTTP answer means, in SMTP terms. */
function failureFor(status: number): GmailApiError {
  if (status === 401 || status === 403) {
    return new GmailApiError('Google refused the sign-in', 'EAUTH', 535);
  }
  // Too many emails too fast: nothing was sent; try again later.
  if (status === 429) return new GmailApiError('Gmail is busy', 'EGMAILBUSY', 421);
  // The email itself was refused (e.g. a bad address).
  if (status >= 400 && status < 500) {
    return new GmailApiError('Gmail refused the email', 'EGMAILREJECTED', 550);
  }
  // A server error after the upload: Gmail may or may not have sent it.
  return new GmailApiError('Gmail had a problem', 'EGMAILUNCERTAIN');
}

/**
 * Sends one email with the Gmail API. A refused token is renewed once (a
 * refusal means nothing was sent) when `renew` is given.
 */
export async function sendWithGmailApi(
  config: SmtpAccountConfig,
  email: OutgoingEmail,
  renew?: RenewAccessToken,
): Promise<SendResult> {
  if (!config.oauth) throw new GmailApiError('Not signed in with Google', 'EAUTH', 535);
  const raw = await rawMessage(email);
  if (raw.byteLength > MAX_UPLOAD_BYTES) {
    throw new GmailApiError('The email is too big for Gmail', 'EGMAILREJECTED', 552);
  }
  const base = config.gmailApiBase ?? GMAIL_API_BASE;
  let response = await upload(base, config.oauth.accessToken, raw);
  if (response.status === 401 && renew) {
    const token = await renew(true);
    config.oauth = token;
    response = await upload(base, token.accessToken, raw);
  }
  if (!response.ok) throw failureFor(response.status);
  const body = (await response.json().catch(() => ({}))) as { id?: unknown };
  return {
    messageId: typeof body.id === 'string' ? body.id : '',
    accepted: [...email.to, ...(email.cc ?? []), ...(email.bcc ?? [])],
    rejected: [],
  };
}
