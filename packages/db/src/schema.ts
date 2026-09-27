import type { Generated } from 'kysely';

/**
 * Table shapes as stored (snake_case, SQLite types). Repositories map these to
 * the domain entities in `@postloom/core`. Booleans are 0/1, JSON is TEXT,
 * timestamps are ISO-8601 UTC strings.
 */

export interface AppSettingsTable {
  key: string;
  value_json: string;
  updated_at: string;
}

export interface EmailAccountsTable {
  id: string;
  name: string;
  provider: string;
  host: string;
  port: number;
  security: string;
  username: string;
  /** 'password', 'google' or 'microsoft' (see AccountAuth). */
  auth: Generated<string>;
  /** Password, or OAuth refresh token, encrypted by the OS keychain (Electron safeStorage); never plaintext. */
  secret_ciphertext: Uint8Array | null;
  daily_limit: number | null;
  delay_ms: number | null;
  last_tested_at: string | null;
  last_test_ok: number | null;
  created_at: string;
  updated_at: string;
}

export interface BrandKitsTable {
  id: string;
  name: string;
  primary_color: string;
  secondary_color: string | null;
  font_family: string;
  logo_asset_id: string | null;
  footer_text: string | null;
  created_at: string;
  updated_at: string;
}

export interface SenderProfilesTable {
  id: string;
  name: string;
  email_account_id: string;
  from_name: string;
  from_address: string;
  reply_to: string | null;
  default_cc: string | null;
  default_bcc: string | null;
  brand_kit_id: string | null;
  delay_ms: number | null;
  signature: string | null;
  created_at: string;
  updated_at: string;
}

export interface TemplatesTable {
  id: string;
  name: string;
  category: string | null;
  subject: string;
  editor_mode: string;
  document_json: string;
  document_version: number;
  default_sender_profile_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface TemplateVersionsTable {
  id: string;
  template_id: string;
  version_no: number;
  subject: string;
  document_json: string;
  note: string | null;
  created_at: string;
}

export interface AssetsTable {
  id: string;
  sha256: string;
  mime: string;
  size: number;
  bytes: Uint8Array;
  width: number | null;
  height: number | null;
  name: string | null;
  created_at: string;
}

export interface TemplateAttachmentsTable {
  template_id: string;
  asset_id: string;
}

export interface SendsTable {
  id: string;
  template_id: string;
  template_version_id: string;
  sender_profile_id: string;
  email_account_id: string;
  resolved_settings_json: string;
  source_file_name: string;
  source_file_sha256: string;
  column_mapping_json: string;
  status: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  pause_reason: string | null;
}

export interface SendRecipientsTable {
  id: string;
  send_id: string;
  row_no: number;
  to_address: string;
  cc: string | null;
  bcc: string | null;
  data_json: string;
  status: string;
  attempts: Generated<number>;
  message_id: string | null;
  error_code: string | null;
  error_message: string | null;
  updated_at: string;
  attachments_json: string | null;
}

export interface SuppressionListTable {
  email: string;
  reason: string;
  added_at: string;
}

export interface DailyUsageTable {
  email_account_id: string;
  date_utc: string;
  count: number;
}

export interface Database {
  app_settings: AppSettingsTable;
  email_accounts: EmailAccountsTable;
  brand_kits: BrandKitsTable;
  sender_profiles: SenderProfilesTable;
  templates: TemplatesTable;
  template_versions: TemplateVersionsTable;
  assets: AssetsTable;
  template_attachments: TemplateAttachmentsTable;
  sends: SendsTable;
  send_recipients: SendRecipientsTable;
  suppression_list: SuppressionListTable;
  daily_usage: DailyUsageTable;
}
