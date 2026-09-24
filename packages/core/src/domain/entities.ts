/**
 * Postloom's domain entities (PLAN.md §7.1). Plain data: persistence lives in
 * `@postloom/db`, validation at trust boundaries in `@postloom/contracts`.
 * Timestamps are ISO-8601 strings in UTC. `null` on an optional setting means
 * "inherit" (see settings/resolve.ts).
 */

export type Id = string;
export type IsoDateTime = string;

export type ProviderId = 'gmail' | 'outlook' | 'yahoo' | 'zoho' | 'icloud' | 'other';
export type ConnectionSecurity = 'tls' | 'starttls';

/** A connection to an email service that does the actual sending. */
export interface EmailAccount {
  id: Id;
  name: string;
  provider: ProviderId;
  host: string;
  port: number;
  security: ConnectionSecurity;
  username: string;
  /** Whether a password/app password is stored in the OS keychain for this account. */
  hasSecret: boolean;
  dailyLimit: number | null;
  delayMs: number | null;
  lastTestedAt: IsoDateTime | null;
  lastTestOk: boolean | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/** Who an email appears to come from. Sends through exactly one account. */
export interface SenderProfile {
  id: Id;
  name: string;
  emailAccountId: Id;
  fromName: string;
  fromAddress: string;
  replyTo: string | null;
  defaultCc: string | null;
  defaultBcc: string | null;
  brandKitId: Id | null;
  delayMs: number | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/** Logo, colours and font applied to a sender's emails. */
export interface BrandKit {
  id: Id;
  name: string;
  primaryColor: string;
  secondaryColor: string | null;
  fontFamily: string;
  logoAssetId: Id | null;
  footerText: string | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export type EditorMode = 'write' | 'design';

/** A reusable email: subject plus the editor document it was made with. */
export interface Template {
  id: Id;
  name: string;
  category: string | null;
  subject: string;
  editorMode: EditorMode;
  /** The editor's document (Write mode: `WriteDocument` from `@postloom/editor`). */
  document: unknown;
  /** Schema version of `document`, for upgrading old designs when opened. */
  documentVersion: number;
  defaultSenderProfileId: Id | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  deletedAt: IsoDateTime | null;
}

/** A snapshot kept on each save, for "Restore an earlier version". */
export interface TemplateVersion {
  id: Id;
  templateId: Id;
  versionNo: number;
  subject: string;
  document: unknown;
  note: string | null;
  createdAt: IsoDateTime;
}

export type SendStatus = 'draft' | 'ready' | 'sending' | 'paused' | 'stopped' | 'finished';

export type RecipientStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'skipped' | 'uncertain';

/** An address Postloom must never send to. Stored lower-case. */
export interface SuppressionEntry {
  email: string;
  reason: string;
  addedAt: IsoDateTime;
}
