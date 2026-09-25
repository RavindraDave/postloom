import {
  AppError,
  normaliseEmail,
  type BrandKit,
  type ConnectionSecurity,
  type EditorMode,
  type EmailAccount,
  type Id,
  type ProviderId,
  type SenderProfile,
  type SuppressionEntry,
  type Template,
  type TemplateVersion,
} from '@postloom/core';
import type { Kysely, Selectable } from 'kysely';
import { createHash, randomUUID } from 'node:crypto';
import type {
  BrandKitsTable,
  Database,
  EmailAccountsTable,
  SenderProfilesTable,
  TemplatesTable,
  TemplateVersionsTable,
} from './schema';

/** Template versions kept per template (PLAN.md §7.1). */
export const MAX_TEMPLATE_VERSIONS = 50;

export interface RepositoryOptions {
  now?: () => Date;
  newId?: () => Id;
}

type Timestamps = 'id' | 'createdAt' | 'updatedAt';

export type NewEmailAccount = Omit<
  EmailAccount,
  Timestamps | 'hasSecret' | 'lastTestedAt' | 'lastTestOk'
>;
export type EmailAccountChanges = Partial<NewEmailAccount>;
export type NewSenderProfile = Omit<SenderProfile, Timestamps>;
export type SenderProfileChanges = Partial<NewSenderProfile>;
export type NewBrandKit = Omit<BrandKit, Timestamps>;
export type BrandKitChanges = Partial<NewBrandKit>;
/** A picture stored in the database (logos and images in emails). */
export interface Asset {
  id: Id;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  name: string | null;
  createdAt: string;
}

export interface NewAsset {
  mime: string;
  bytes: Uint8Array;
  width: number | null;
  height: number | null;
  name: string | null;
}

export type NewTemplate = Omit<Template, Timestamps | 'deletedAt'>;
export type TemplateChanges = Partial<Omit<NewTemplate, 'editorMode'>> & {
  editorMode?: EditorMode;
};

export function createRepositories(db: Kysely<Database>, options: RepositoryOptions = {}) {
  const now = () => (options.now ?? (() => new Date()))().toISOString();
  const newId = options.newId ?? randomUUID;

  const notFound = (what: string, id: string) =>
    new AppError({ code: 'NOT_FOUND', messageKey: 'errors.notFound', details: { what, id } });

  /** Runs a write, turning foreign-key failures into a friendly "still in use" error. */
  async function guardInUse<T>(what: string, work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof Error && /FOREIGN KEY constraint failed/i.test(error.message)) {
        throw new AppError(
          { code: 'IN_USE', messageKey: 'errors.inUse', details: { what } },
          { cause: error },
        );
      }
      throw error;
    }
  }

  const settings = {
    async get<T>(key: string, fallback: T): Promise<T> {
      const row = await db
        .selectFrom('app_settings')
        .select('value_json')
        .where('key', '=', key)
        .executeTakeFirst();
      return row ? (JSON.parse(row.value_json) as T) : fallback;
    },
    async set(key: string, value: unknown): Promise<void> {
      const valueJson = JSON.stringify(value);
      await db
        .insertInto('app_settings')
        .values({ key, value_json: valueJson, updated_at: now() })
        .onConflict((oc) =>
          oc.column('key').doUpdateSet({ value_json: valueJson, updated_at: now() }),
        )
        .execute();
    },
    async all(): Promise<Record<string, unknown>> {
      const rows = await db.selectFrom('app_settings').selectAll().execute();
      return Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value_json) as unknown]));
    },
  };

  const accounts = {
    async list(): Promise<EmailAccount[]> {
      const rows = await db.selectFrom('email_accounts').selectAll().orderBy('name').execute();
      return rows.map(toAccount);
    },
    async get(id: Id): Promise<EmailAccount> {
      const row = await db
        .selectFrom('email_accounts')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();
      if (!row) throw notFound('emailAccount', id);
      return toAccount(row);
    },
    async create(input: NewEmailAccount): Promise<EmailAccount> {
      const id = newId();
      const at = now();
      await db
        .insertInto('email_accounts')
        .values({
          id,
          name: input.name,
          provider: input.provider,
          host: input.host,
          port: input.port,
          security: input.security,
          username: input.username,
          secret_ciphertext: null,
          daily_limit: input.dailyLimit,
          delay_ms: input.delayMs,
          last_tested_at: null,
          last_test_ok: null,
          created_at: at,
          updated_at: at,
        })
        .execute();
      return accounts.get(id);
    },
    async update(id: Id, changes: EmailAccountChanges): Promise<EmailAccount> {
      const result = await db
        .updateTable('email_accounts')
        .set({
          ...(changes.name !== undefined && { name: changes.name }),
          ...(changes.provider !== undefined && { provider: changes.provider }),
          ...(changes.host !== undefined && { host: changes.host }),
          ...(changes.port !== undefined && { port: changes.port }),
          ...(changes.security !== undefined && { security: changes.security }),
          ...(changes.username !== undefined && { username: changes.username }),
          ...(changes.dailyLimit !== undefined && { daily_limit: changes.dailyLimit }),
          ...(changes.delayMs !== undefined && { delay_ms: changes.delayMs }),
          updated_at: now(),
        })
        .where('id', '=', id)
        .executeTakeFirst();
      if (result.numUpdatedRows === 0n) throw notFound('emailAccount', id);
      return accounts.get(id);
    },
    /** Stores the keychain-encrypted password. Pass null to forget it. */
    async setSecret(id: Id, ciphertext: Uint8Array | null): Promise<void> {
      const result = await db
        .updateTable('email_accounts')
        .set({ secret_ciphertext: ciphertext, updated_at: now() })
        .where('id', '=', id)
        .executeTakeFirst();
      if (result.numUpdatedRows === 0n) throw notFound('emailAccount', id);
    },
    /** For the main/sending process only: never send this to the renderer. */
    async getSecret(id: Id): Promise<Uint8Array | null> {
      const row = await db
        .selectFrom('email_accounts')
        .select('secret_ciphertext')
        .where('id', '=', id)
        .executeTakeFirst();
      if (!row) throw notFound('emailAccount', id);
      return row.secret_ciphertext;
    },
    async recordTest(id: Id, ok: boolean): Promise<void> {
      await db
        .updateTable('email_accounts')
        .set({ last_tested_at: now(), last_test_ok: ok ? 1 : 0 })
        .where('id', '=', id)
        .execute();
    },
    async delete(id: Id): Promise<void> {
      await guardInUse('emailAccount', () =>
        db.deleteFrom('email_accounts').where('id', '=', id).execute(),
      );
    },
  };

  const senders = {
    async list(): Promise<SenderProfile[]> {
      const rows = await db.selectFrom('sender_profiles').selectAll().orderBy('name').execute();
      return rows.map(toSender);
    },
    async get(id: Id): Promise<SenderProfile> {
      const row = await db
        .selectFrom('sender_profiles')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();
      if (!row) throw notFound('senderProfile', id);
      return toSender(row);
    },
    async create(input: NewSenderProfile): Promise<SenderProfile> {
      const id = newId();
      const at = now();
      await guardInUse('emailAccount', () =>
        db
          .insertInto('sender_profiles')
          .values({
            id,
            name: input.name,
            email_account_id: input.emailAccountId,
            from_name: input.fromName,
            from_address: input.fromAddress,
            reply_to: input.replyTo,
            default_cc: input.defaultCc,
            default_bcc: input.defaultBcc,
            brand_kit_id: input.brandKitId,
            delay_ms: input.delayMs,
            created_at: at,
            updated_at: at,
          })
          .execute(),
      );
      return senders.get(id);
    },
    async update(id: Id, changes: SenderProfileChanges): Promise<SenderProfile> {
      const result = await db
        .updateTable('sender_profiles')
        .set({
          ...(changes.name !== undefined && { name: changes.name }),
          ...(changes.emailAccountId !== undefined && { email_account_id: changes.emailAccountId }),
          ...(changes.fromName !== undefined && { from_name: changes.fromName }),
          ...(changes.fromAddress !== undefined && { from_address: changes.fromAddress }),
          ...(changes.replyTo !== undefined && { reply_to: changes.replyTo }),
          ...(changes.defaultCc !== undefined && { default_cc: changes.defaultCc }),
          ...(changes.defaultBcc !== undefined && { default_bcc: changes.defaultBcc }),
          ...(changes.brandKitId !== undefined && { brand_kit_id: changes.brandKitId }),
          ...(changes.delayMs !== undefined && { delay_ms: changes.delayMs }),
          updated_at: now(),
        })
        .where('id', '=', id)
        .executeTakeFirst();
      if (result.numUpdatedRows === 0n) throw notFound('senderProfile', id);
      return senders.get(id);
    },
    /** How many templates use this sender by default ("Used by 4 templates"). */
    async templateCount(id: Id): Promise<number> {
      const row = await db
        .selectFrom('templates')
        .select((eb) => eb.fn.countAll<number>().as('n'))
        .where('default_sender_profile_id', '=', id)
        .where('deleted_at', 'is', null)
        .executeTakeFirstOrThrow();
      return row.n;
    },
    async delete(id: Id): Promise<void> {
      await guardInUse('senderProfile', () =>
        db.deleteFrom('sender_profiles').where('id', '=', id).execute(),
      );
    },
  };

  const brandKits = {
    async list(): Promise<BrandKit[]> {
      const rows = await db.selectFrom('brand_kits').selectAll().orderBy('name').execute();
      return rows.map(toBrandKit);
    },
    async get(id: Id): Promise<BrandKit> {
      const row = await db
        .selectFrom('brand_kits')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();
      if (!row) throw notFound('brandKit', id);
      return toBrandKit(row);
    },
    async create(input: NewBrandKit): Promise<BrandKit> {
      const id = newId();
      const at = now();
      await db
        .insertInto('brand_kits')
        .values({
          id,
          name: input.name,
          primary_color: input.primaryColor,
          secondary_color: input.secondaryColor,
          font_family: input.fontFamily,
          logo_asset_id: input.logoAssetId,
          footer_text: input.footerText,
          created_at: at,
          updated_at: at,
        })
        .execute();
      return brandKits.get(id);
    },
    async update(id: Id, changes: BrandKitChanges): Promise<BrandKit> {
      const result = await db
        .updateTable('brand_kits')
        .set({
          ...(changes.name !== undefined && { name: changes.name }),
          ...(changes.primaryColor !== undefined && { primary_color: changes.primaryColor }),
          ...(changes.secondaryColor !== undefined && { secondary_color: changes.secondaryColor }),
          ...(changes.fontFamily !== undefined && { font_family: changes.fontFamily }),
          ...(changes.logoAssetId !== undefined && { logo_asset_id: changes.logoAssetId }),
          ...(changes.footerText !== undefined && { footer_text: changes.footerText }),
          updated_at: now(),
        })
        .where('id', '=', id)
        .executeTakeFirst();
      if (result.numUpdatedRows === 0n) throw notFound('brandKit', id);
      return brandKits.get(id);
    },
    async delete(id: Id): Promise<void> {
      await db.deleteFrom('brand_kits').where('id', '=', id).execute();
    },
  };

  const assets = {
    /** Stores a picture once: adding the same bytes again returns the existing one. */
    async put(input: NewAsset): Promise<Asset> {
      const sha256 = createHash('sha256').update(input.bytes).digest('hex');
      const existing = await db
        .selectFrom('assets')
        .select('id')
        .where('sha256', '=', sha256)
        .executeTakeFirst();
      if (existing) return assets.get(existing.id);
      const id = newId();
      await db
        .insertInto('assets')
        .values({
          id,
          sha256,
          mime: input.mime,
          size: input.bytes.byteLength,
          bytes: input.bytes,
          width: input.width,
          height: input.height,
          name: input.name,
          created_at: now(),
        })
        .execute();
      return assets.get(id);
    },
    async get(id: Id): Promise<Asset> {
      const row = await db
        .selectFrom('assets')
        .select(['id', 'mime', 'size', 'width', 'height', 'name', 'created_at'])
        .where('id', '=', id)
        .executeTakeFirst();
      if (!row) throw notFound('asset', id);
      return {
        id: row.id,
        mime: row.mime,
        size: row.size,
        width: row.width,
        height: row.height,
        name: row.name,
        createdAt: row.created_at,
      };
    },
    /** The picture's bytes, or null if it no longer exists. */
    async read(id: Id): Promise<{ mime: string; bytes: Uint8Array } | null> {
      const row = await db
        .selectFrom('assets')
        .select(['mime', 'bytes'])
        .where('id', '=', id)
        .executeTakeFirst();
      return row ? { mime: row.mime, bytes: row.bytes } : null;
    },
  };

  /** Emails sent per account per UTC day, across every send (daily limits). */
  const usage = {
    async sentOn(accountId: Id, dateUtc: string): Promise<number> {
      const row = await db
        .selectFrom('daily_usage')
        .select('count')
        .where('email_account_id', '=', accountId)
        .where('date_utc', '=', dateUtc)
        .executeTakeFirst();
      return row?.count ?? 0;
    },
    async add(accountId: Id, dateUtc: string, count = 1): Promise<number> {
      await db
        .insertInto('daily_usage')
        .values({ email_account_id: accountId, date_utc: dateUtc, count })
        .onConflict((conflict) =>
          conflict
            .columns(['email_account_id', 'date_utc'])
            .doUpdateSet((eb) => ({ count: eb('daily_usage.count', '+', count) })),
        )
        .execute();
      return usage.sentOn(accountId, dateUtc);
    },
  };

  const templates = {
    /** Templates not in the bin, most recently changed first. */
    async list(): Promise<Template[]> {
      const rows = await db
        .selectFrom('templates')
        .selectAll()
        .where('deleted_at', 'is', null)
        .orderBy('updated_at', 'desc')
        .orderBy('name')
        .execute();
      return rows.map(toTemplate);
    },
    async get(id: Id): Promise<Template> {
      const row = await db
        .selectFrom('templates')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();
      if (!row) throw notFound('template', id);
      return toTemplate(row);
    },
    async create(input: NewTemplate): Promise<Template> {
      const id = newId();
      const at = now();
      await db.transaction().execute(async (trx) => {
        await trx
          .insertInto('templates')
          .values({
            id,
            name: input.name,
            category: input.category,
            subject: input.subject,
            editor_mode: input.editorMode,
            document_json: JSON.stringify(input.document),
            document_version: input.documentVersion,
            default_sender_profile_id: input.defaultSenderProfileId,
            created_at: at,
            updated_at: at,
            deleted_at: null,
          })
          .execute();
        await trx
          .insertInto('template_versions')
          .values({
            id: newId(),
            template_id: id,
            version_no: 1,
            subject: input.subject,
            document_json: JSON.stringify(input.document),
            note: null,
            created_at: at,
          })
          .execute();
      });
      return templates.get(id);
    },
    /**
     * Saves changes. With `snapshot` (a manual save), also records a version
     * for "Restore an earlier version", keeping the newest 50.
     */
    async update(
      id: Id,
      changes: TemplateChanges,
      save: { snapshot: boolean; note?: string } = { snapshot: false },
    ): Promise<Template> {
      const at = now();
      await db.transaction().execute(async (trx) => {
        const result = await trx
          .updateTable('templates')
          .set({
            ...(changes.name !== undefined && { name: changes.name }),
            ...(changes.category !== undefined && { category: changes.category }),
            ...(changes.subject !== undefined && { subject: changes.subject }),
            ...(changes.editorMode !== undefined && { editor_mode: changes.editorMode }),
            ...(changes.document !== undefined && {
              document_json: JSON.stringify(changes.document),
            }),
            ...(changes.documentVersion !== undefined && {
              document_version: changes.documentVersion,
            }),
            ...(changes.defaultSenderProfileId !== undefined && {
              default_sender_profile_id: changes.defaultSenderProfileId,
            }),
            updated_at: at,
          })
          .where('id', '=', id)
          .where('deleted_at', 'is', null)
          .executeTakeFirst();
        if (result.numUpdatedRows === 0n) throw notFound('template', id);
        if (!save.snapshot) return;

        const current = await trx
          .selectFrom('templates')
          .select(['subject', 'document_json'])
          .where('id', '=', id)
          .executeTakeFirstOrThrow();
        const last = await trx
          .selectFrom('template_versions')
          .select((eb) => eb.fn.max<number>('version_no').as('n'))
          .where('template_id', '=', id)
          .executeTakeFirst();
        const versionNo = (last?.n ?? 0) + 1;
        await trx
          .insertInto('template_versions')
          .values({
            id: newId(),
            template_id: id,
            version_no: versionNo,
            subject: current.subject,
            document_json: current.document_json,
            note: save.note ?? null,
            created_at: at,
          })
          .execute();
        await trx
          .deleteFrom('template_versions')
          .where('template_id', '=', id)
          .where('version_no', '<=', versionNo - MAX_TEMPLATE_VERSIONS)
          .execute();
      });
      return templates.get(id);
    },
    async versions(id: Id): Promise<TemplateVersion[]> {
      const rows = await db
        .selectFrom('template_versions')
        .selectAll()
        .where('template_id', '=', id)
        .orderBy('version_no', 'desc')
        .execute();
      return rows.map(toVersion);
    },
    /** Brings back an earlier version's subject and content (as a new version). */
    async restoreVersion(id: Id, versionNo: number): Promise<Template> {
      const version = await db
        .selectFrom('template_versions')
        .selectAll()
        .where('template_id', '=', id)
        .where('version_no', '=', versionNo)
        .executeTakeFirst();
      if (!version) throw notFound('templateVersion', `${id}#${versionNo}`);
      return templates.update(
        id,
        { subject: version.subject, document: JSON.parse(version.document_json) as unknown },
        { snapshot: true, note: `Restored version ${versionNo}` },
      );
    },
    /** Moves to the bin; can be undone with `restore`. */
    async softDelete(id: Id): Promise<void> {
      await db.updateTable('templates').set({ deleted_at: now() }).where('id', '=', id).execute();
    },
    async restore(id: Id): Promise<void> {
      await db.updateTable('templates').set({ deleted_at: null }).where('id', '=', id).execute();
    },
  };

  const suppression = {
    async add(email: string, reason: string): Promise<void> {
      await db
        .insertInto('suppression_list')
        .values({ email: normaliseEmail(email), reason, added_at: now() })
        .onConflict((oc) => oc.column('email').doNothing())
        .execute();
    },
    async remove(email: string): Promise<void> {
      await db.deleteFrom('suppression_list').where('email', '=', normaliseEmail(email)).execute();
    },
    async has(email: string): Promise<boolean> {
      const row = await db
        .selectFrom('suppression_list')
        .select('email')
        .where('email', '=', normaliseEmail(email))
        .executeTakeFirst();
      return row !== undefined;
    },
    async list(): Promise<SuppressionEntry[]> {
      const rows = await db.selectFrom('suppression_list').selectAll().orderBy('email').execute();
      return rows.map((r) => ({ email: r.email, reason: r.reason, addedAt: r.added_at }));
    },
  };

  return { settings, accounts, senders, brandKits, assets, usage, templates, suppression };
}

export type Repositories = ReturnType<typeof createRepositories>;

function toAccount(row: Selectable<EmailAccountsTable>): EmailAccount {
  return {
    id: row.id,
    name: row.name,
    provider: row.provider as ProviderId,
    host: row.host,
    port: row.port,
    security: row.security as ConnectionSecurity,
    username: row.username,
    hasSecret: row.secret_ciphertext !== null && row.secret_ciphertext.byteLength > 0,
    dailyLimit: row.daily_limit,
    delayMs: row.delay_ms,
    lastTestedAt: row.last_tested_at,
    lastTestOk: row.last_test_ok === null ? null : row.last_test_ok === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toSender(row: Selectable<SenderProfilesTable>): SenderProfile {
  return {
    id: row.id,
    name: row.name,
    emailAccountId: row.email_account_id,
    fromName: row.from_name,
    fromAddress: row.from_address,
    replyTo: row.reply_to,
    defaultCc: row.default_cc,
    defaultBcc: row.default_bcc,
    brandKitId: row.brand_kit_id,
    delayMs: row.delay_ms,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toBrandKit(row: Selectable<BrandKitsTable>): BrandKit {
  return {
    id: row.id,
    name: row.name,
    primaryColor: row.primary_color,
    secondaryColor: row.secondary_color,
    fontFamily: row.font_family,
    logoAssetId: row.logo_asset_id,
    footerText: row.footer_text,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toTemplate(row: Selectable<TemplatesTable>): Template {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    subject: row.subject,
    editorMode: row.editor_mode as EditorMode,
    document: JSON.parse(row.document_json) as unknown,
    documentVersion: row.document_version,
    defaultSenderProfileId: row.default_sender_profile_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function toVersion(row: Selectable<TemplateVersionsTable>): TemplateVersion {
  return {
    id: row.id,
    templateId: row.template_id,
    versionNo: row.version_no,
    subject: row.subject,
    document: JSON.parse(row.document_json) as unknown,
    note: row.note,
    createdAt: row.created_at,
  };
}
