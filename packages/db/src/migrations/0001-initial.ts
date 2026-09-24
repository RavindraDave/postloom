import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * Initial schema (PLAN.md §7.1). Migrations are forward-only: never edit a
 * released migration; add a new one instead.
 */
export const initial: Migration = {
  async up(db: Kysely<unknown>) {
    await db.schema
      .createTable('app_settings')
      .addColumn('key', 'text', (c) => c.primaryKey())
      .addColumn('value_json', 'text', (c) => c.notNull())
      .addColumn('updated_at', 'text', (c) => c.notNull())
      .execute();

    await db.schema
      .createTable('email_accounts')
      .addColumn('id', 'text', (c) => c.primaryKey())
      .addColumn('name', 'text', (c) => c.notNull())
      .addColumn('provider', 'text', (c) => c.notNull())
      .addColumn('host', 'text', (c) => c.notNull())
      .addColumn('port', 'integer', (c) => c.notNull().check(sql`port between 1 and 65535`))
      .addColumn('security', 'text', (c) => c.notNull().check(sql`security in ('tls', 'starttls')`))
      .addColumn('username', 'text', (c) => c.notNull())
      .addColumn('secret_ciphertext', 'blob')
      .addColumn('daily_limit', 'integer', (c) => c.check(sql`daily_limit >= 0`))
      .addColumn('delay_ms', 'integer', (c) => c.check(sql`delay_ms >= 0`))
      .addColumn('last_tested_at', 'text')
      .addColumn('last_test_ok', 'integer')
      .addColumn('created_at', 'text', (c) => c.notNull())
      .addColumn('updated_at', 'text', (c) => c.notNull())
      .execute();

    await db.schema
      .createTable('brand_kits')
      .addColumn('id', 'text', (c) => c.primaryKey())
      .addColumn('name', 'text', (c) => c.notNull())
      .addColumn('primary_color', 'text', (c) => c.notNull())
      .addColumn('secondary_color', 'text')
      .addColumn('font_family', 'text', (c) => c.notNull())
      .addColumn('logo_asset_id', 'text', (c) => c.references('assets.id').onDelete('set null'))
      .addColumn('footer_text', 'text')
      .addColumn('created_at', 'text', (c) => c.notNull())
      .addColumn('updated_at', 'text', (c) => c.notNull())
      .execute();

    await db.schema
      .createTable('sender_profiles')
      .addColumn('id', 'text', (c) => c.primaryKey())
      .addColumn('name', 'text', (c) => c.notNull())
      .addColumn('email_account_id', 'text', (c) =>
        c.notNull().references('email_accounts.id').onDelete('restrict'),
      )
      .addColumn('from_name', 'text', (c) => c.notNull())
      .addColumn('from_address', 'text', (c) => c.notNull())
      .addColumn('reply_to', 'text')
      .addColumn('default_cc', 'text')
      .addColumn('default_bcc', 'text')
      .addColumn('brand_kit_id', 'text', (c) => c.references('brand_kits.id').onDelete('set null'))
      .addColumn('delay_ms', 'integer', (c) => c.check(sql`delay_ms >= 0`))
      .addColumn('created_at', 'text', (c) => c.notNull())
      .addColumn('updated_at', 'text', (c) => c.notNull())
      .execute();

    await db.schema
      .createTable('templates')
      .addColumn('id', 'text', (c) => c.primaryKey())
      .addColumn('name', 'text', (c) => c.notNull())
      .addColumn('category', 'text')
      .addColumn('subject', 'text', (c) => c.notNull())
      .addColumn('editor_mode', 'text', (c) =>
        c.notNull().check(sql`editor_mode in ('write', 'design')`),
      )
      .addColumn('document_json', 'text', (c) => c.notNull())
      .addColumn('document_version', 'integer', (c) => c.notNull())
      .addColumn('default_sender_profile_id', 'text', (c) =>
        c.references('sender_profiles.id').onDelete('set null'),
      )
      .addColumn('created_at', 'text', (c) => c.notNull())
      .addColumn('updated_at', 'text', (c) => c.notNull())
      .addColumn('deleted_at', 'text')
      .execute();

    await db.schema
      .createTable('template_versions')
      .addColumn('id', 'text', (c) => c.primaryKey())
      .addColumn('template_id', 'text', (c) =>
        c.notNull().references('templates.id').onDelete('cascade'),
      )
      .addColumn('version_no', 'integer', (c) => c.notNull())
      .addColumn('subject', 'text', (c) => c.notNull())
      .addColumn('document_json', 'text', (c) => c.notNull())
      .addColumn('note', 'text')
      .addColumn('created_at', 'text', (c) => c.notNull())
      .addUniqueConstraint('template_versions_template_version', ['template_id', 'version_no'])
      .execute();

    await db.schema
      .createTable('assets')
      .addColumn('id', 'text', (c) => c.primaryKey())
      .addColumn('sha256', 'text', (c) => c.notNull().unique())
      .addColumn('mime', 'text', (c) => c.notNull())
      .addColumn('size', 'integer', (c) => c.notNull())
      .addColumn('bytes', 'blob', (c) => c.notNull())
      .addColumn('created_at', 'text', (c) => c.notNull())
      .execute();

    await db.schema
      .createTable('template_attachments')
      .addColumn('template_id', 'text', (c) =>
        c.notNull().references('templates.id').onDelete('cascade'),
      )
      .addColumn('asset_id', 'text', (c) => c.notNull().references('assets.id').onDelete('cascade'))
      .addPrimaryKeyConstraint('template_attachments_pk', ['template_id', 'asset_id'])
      .execute();

    await db.schema
      .createTable('sends')
      .addColumn('id', 'text', (c) => c.primaryKey())
      .addColumn('template_id', 'text', (c) => c.notNull().references('templates.id'))
      .addColumn('template_version_id', 'text', (c) =>
        c.notNull().references('template_versions.id'),
      )
      .addColumn('sender_profile_id', 'text', (c) => c.notNull().references('sender_profiles.id'))
      .addColumn('email_account_id', 'text', (c) => c.notNull().references('email_accounts.id'))
      .addColumn('resolved_settings_json', 'text', (c) => c.notNull())
      .addColumn('source_file_name', 'text', (c) => c.notNull())
      .addColumn('source_file_sha256', 'text', (c) => c.notNull())
      .addColumn('column_mapping_json', 'text', (c) => c.notNull())
      .addColumn('status', 'text', (c) =>
        c
          .notNull()
          .check(sql`status in ('draft', 'ready', 'sending', 'paused', 'stopped', 'finished')`),
      )
      .addColumn('created_at', 'text', (c) => c.notNull())
      .addColumn('started_at', 'text')
      .addColumn('finished_at', 'text')
      .execute();

    await db.schema
      .createTable('send_recipients')
      .addColumn('id', 'text', (c) => c.primaryKey())
      .addColumn('send_id', 'text', (c) => c.notNull().references('sends.id').onDelete('cascade'))
      .addColumn('row_no', 'integer', (c) => c.notNull())
      .addColumn('to_address', 'text', (c) => c.notNull())
      .addColumn('cc', 'text')
      .addColumn('bcc', 'text')
      .addColumn('data_json', 'text', (c) => c.notNull())
      .addColumn('status', 'text', (c) =>
        c
          .notNull()
          .check(sql`status in ('pending', 'sending', 'sent', 'failed', 'skipped', 'uncertain')`),
      )
      .addColumn('attempts', 'integer', (c) => c.notNull().defaultTo(0))
      .addColumn('message_id', 'text')
      .addColumn('error_code', 'text')
      .addColumn('error_message', 'text')
      .addColumn('updated_at', 'text', (c) => c.notNull())
      .execute();

    await db.schema
      .createTable('suppression_list')
      .addColumn('email', 'text', (c) => c.primaryKey())
      .addColumn('reason', 'text', (c) => c.notNull())
      .addColumn('added_at', 'text', (c) => c.notNull())
      .execute();

    await db.schema
      .createTable('daily_usage')
      .addColumn('email_account_id', 'text', (c) =>
        c.notNull().references('email_accounts.id').onDelete('cascade'),
      )
      .addColumn('date_utc', 'text', (c) => c.notNull())
      .addColumn('count', 'integer', (c) => c.notNull().defaultTo(0))
      .addPrimaryKeyConstraint('daily_usage_pk', ['email_account_id', 'date_utc'])
      .execute();

    await db.schema
      .createIndex('sender_profiles_account')
      .on('sender_profiles')
      .column('email_account_id')
      .execute();
    await db.schema
      .createIndex('templates_updated')
      .on('templates')
      .columns(['deleted_at', 'updated_at'])
      .execute();
    await db.schema
      .createIndex('send_recipients_status')
      .on('send_recipients')
      .columns(['send_id', 'status'])
      .execute();
  },
};
