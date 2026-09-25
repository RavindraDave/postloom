import { AppError, type Id, type RecipientStatus, type SendStatus } from '@postloom/core';
import type { Kysely, Selectable } from 'kysely';
import type { Database, SendRecipientsTable, SendsTable } from './schema';

/** Why a send is paused; shown to the person in plain words. */
export type PauseReason = 'user' | 'dailyLimit' | 'auth' | 'connection' | 'interrupted' | 'sleep';

/** Settings fixed when the send starts, so later changes don't affect it. */
export interface SendSettings {
  delayMs: number;
  dailyLimit: number;
}

export interface SendRecord {
  id: Id;
  templateId: Id;
  templateVersionId: Id;
  senderProfileId: Id;
  emailAccountId: Id;
  settings: SendSettings;
  sourceFileName: string;
  sourceFileSha256: string;
  mapping: unknown;
  status: SendStatus;
  pauseReason: PauseReason | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface SendRecipient {
  id: Id;
  sendId: Id;
  rowNo: number;
  to: string[];
  cc: string[];
  bcc: string[];
  values: Record<string, string>;
  status: RecipientStatus;
  attempts: number;
  messageId: string | null;
  /** A short reason code (e.g. `invalidAddress`, `rejected`, `interrupted`). */
  errorCode: string | null;
  updatedAt: string;
}

export interface NewSend {
  templateId: Id;
  templateVersionId: Id;
  senderProfileId: Id;
  emailAccountId: Id;
  settings: SendSettings;
  sourceFileName: string;
  sourceFileSha256: string;
  mapping: unknown;
  recipients: {
    rowNo: number;
    to: string[];
    cc: string[];
    bcc: string[];
    values: Record<string, string>;
    /** Rows left out (and why) are kept too, for the report. */
    skipped?: string | undefined;
  }[];
}

export type RecipientCounts = Record<RecipientStatus, number>;

const EMPTY_COUNTS: RecipientCounts = {
  pending: 0,
  sending: 0,
  sent: 0,
  failed: 0,
  skipped: 0,
  uncertain: 0,
};

/** SQLite limits bound variables per statement; insert people in batches. */
const INSERT_BATCH = 200;

const joinAddresses = (addresses: string[]) => addresses.join(', ');
const splitAddresses = (text: string | null) => (text ? text.split(', ').filter(Boolean) : []);

function toSend(row: Selectable<SendsTable>): SendRecord {
  return {
    id: row.id,
    templateId: row.template_id,
    templateVersionId: row.template_version_id,
    senderProfileId: row.sender_profile_id,
    emailAccountId: row.email_account_id,
    settings: JSON.parse(row.resolved_settings_json) as SendSettings,
    sourceFileName: row.source_file_name,
    sourceFileSha256: row.source_file_sha256,
    mapping: JSON.parse(row.column_mapping_json) as unknown,
    status: row.status as SendStatus,
    pauseReason: row.pause_reason as PauseReason | null,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

function toRecipient(row: Selectable<SendRecipientsTable>): SendRecipient {
  return {
    id: row.id,
    sendId: row.send_id,
    rowNo: row.row_no,
    to: splitAddresses(row.to_address),
    cc: splitAddresses(row.cc),
    bcc: splitAddresses(row.bcc),
    values: JSON.parse(row.data_json) as Record<string, string>,
    status: row.status as RecipientStatus,
    attempts: row.attempts,
    messageId: row.message_id,
    errorCode: row.error_code,
    updatedAt: row.updated_at,
  };
}

/**
 * Sends and the people in them. Every change of a person's state is its own
 * committed write, so a crash can never lose track of who was emailed
 * (PLAN.md §9): a person is marked `sending` before the server is contacted,
 * and anyone still `sending` after a restart becomes `uncertain` and is never
 * emailed again without asking.
 */
export function createSendRepository(db: Kysely<Database>, now: () => string, newId: () => Id) {
  const notFound = (id: string) =>
    new AppError({
      code: 'NOT_FOUND',
      messageKey: 'errors.notFound',
      details: { what: 'send', id },
    });

  const setRecipient = (
    id: Id,
    from: RecipientStatus[],
    changes: Partial<Pick<Selectable<SendRecipientsTable>, 'status' | 'message_id' | 'error_code'>>,
  ) =>
    db
      .updateTable('send_recipients')
      .set({ ...changes, updated_at: now() })
      .where('id', '=', id)
      .where('status', 'in', from)
      .executeTakeFirst()
      .then((result) => result.numUpdatedRows > 0n);

  const sends = {
    async create(input: NewSend): Promise<SendRecord> {
      const id = newId();
      const at = now();
      await db.transaction().execute(async (trx) => {
        await trx
          .insertInto('sends')
          .values({
            id,
            template_id: input.templateId,
            template_version_id: input.templateVersionId,
            sender_profile_id: input.senderProfileId,
            email_account_id: input.emailAccountId,
            resolved_settings_json: JSON.stringify(input.settings),
            source_file_name: input.sourceFileName,
            source_file_sha256: input.sourceFileSha256,
            column_mapping_json: JSON.stringify(input.mapping),
            status: 'ready',
            pause_reason: null,
            created_at: at,
            started_at: null,
            finished_at: null,
          })
          .execute();
        for (let start = 0; start < input.recipients.length; start += INSERT_BATCH) {
          await trx
            .insertInto('send_recipients')
            .values(
              input.recipients.slice(start, start + INSERT_BATCH).map((person) => ({
                id: newId(),
                send_id: id,
                row_no: person.rowNo,
                to_address: joinAddresses(person.to),
                cc: person.cc.length ? joinAddresses(person.cc) : null,
                bcc: person.bcc.length ? joinAddresses(person.bcc) : null,
                data_json: JSON.stringify(person.values),
                status: person.skipped ? 'skipped' : 'pending',
                error_code: person.skipped ?? null,
                error_message: null,
                message_id: null,
                updated_at: at,
              })),
            )
            .execute();
        }
      });
      return sends.get(id);
    },

    async get(id: Id): Promise<SendRecord> {
      const row = await db.selectFrom('sends').selectAll().where('id', '=', id).executeTakeFirst();
      if (!row) throw notFound(id);
      return toSend(row);
    },

    /** Newest first. */
    async list(): Promise<SendRecord[]> {
      const rows = await db
        .selectFrom('sends')
        .selectAll()
        .orderBy('created_at', 'desc')
        .orderBy('id')
        .execute();
      return rows.map(toSend);
    },

    async counts(id: Id): Promise<RecipientCounts> {
      const rows = await db
        .selectFrom('send_recipients')
        .select(['status', (eb) => eb.fn.countAll<number | bigint>().as('n')])
        .where('send_id', '=', id)
        .groupBy('status')
        .execute();
      const counts = { ...EMPTY_COUNTS };
      for (const row of rows) counts[row.status as RecipientStatus] = Number(row.n);
      return counts;
    },

    async recipients(id: Id, status?: RecipientStatus): Promise<SendRecipient[]> {
      let query = db
        .selectFrom('send_recipients')
        .selectAll()
        .where('send_id', '=', id)
        .orderBy('row_no');
      if (status) query = query.where('status', '=', status);
      return (await query.execute()).map(toRecipient);
    },

    /** The next person to email, in spreadsheet order. */
    async nextPending(id: Id): Promise<SendRecipient | null> {
      const row = await db
        .selectFrom('send_recipients')
        .selectAll()
        .where('send_id', '=', id)
        .where('status', '=', 'pending')
        .orderBy('row_no')
        .limit(1)
        .executeTakeFirst();
      return row ? toRecipient(row) : null;
    },

    /** Marks a person `sending` (committed) before the server is contacted. */
    async claim(recipientId: Id): Promise<boolean> {
      const result = await db
        .updateTable('send_recipients')
        .set((eb) => ({
          status: 'sending',
          attempts: eb('attempts', '+', 1),
          updated_at: now(),
        }))
        .where('id', '=', recipientId)
        .where('status', '=', 'pending')
        .executeTakeFirst();
      return result.numUpdatedRows > 0n;
    },

    markSent: (recipientId: Id, messageId: string) =>
      setRecipient(recipientId, ['sending'], {
        status: 'sent',
        message_id: messageId.slice(0, 500),
        error_code: null,
      }),
    markFailed: (recipientId: Id, errorCode: string) =>
      setRecipient(recipientId, ['sending'], { status: 'failed', error_code: errorCode }),
    /** The server may or may not have taken the email: never resent without asking. */
    markUncertain: (recipientId: Id, errorCode: string) =>
      setRecipient(recipientId, ['sending'], { status: 'uncertain', error_code: errorCode }),
    /** Puts a person back when the email certainly wasn't sent (e.g. couldn't sign in). */
    release: (recipientId: Id) =>
      setRecipient(recipientId, ['sending'], { status: 'pending', error_code: null }),

    async setStatus(id: Id, status: SendStatus, pauseReason: PauseReason | null = null) {
      const at = now();
      const result = await db
        .updateTable('sends')
        .set((eb) => ({
          status,
          pause_reason: status === 'paused' ? pauseReason : null,
          started_at: status === 'sending' ? eb.fn.coalesce('started_at', eb.val(at)) : undefined,
          finished_at: status === 'finished' ? at : null,
        }))
        .where('id', '=', id)
        .executeTakeFirst();
      if (result.numUpdatedRows === 0n) throw notFound(id);
    },

    /**
     * After a crash or forced quit: anyone left `sending` becomes `uncertain`,
     * and sends that were running are paused. Returns the sends affected.
     */
    async recoverInterrupted(): Promise<Id[]> {
      return db.transaction().execute(async (trx) => {
        const running = await trx
          .selectFrom('sends')
          .select('id')
          .where('status', '=', 'sending')
          .execute();
        await trx
          .updateTable('send_recipients')
          .set({ status: 'uncertain', error_code: 'interrupted', updated_at: now() })
          .where('status', '=', 'sending')
          .execute();
        await trx
          .updateTable('sends')
          .set({ status: 'paused', pause_reason: 'interrupted' })
          .where('status', '=', 'sending')
          .execute();
        return running.map((row) => row.id);
      });
    },

    /** When one send's sending process died: same as after a crash, for that send only. */
    async recoverSend(id: Id): Promise<void> {
      await db.transaction().execute(async (trx) => {
        await trx
          .updateTable('send_recipients')
          .set({ status: 'uncertain', error_code: 'interrupted', updated_at: now() })
          .where('send_id', '=', id)
          .where('status', '=', 'sending')
          .execute();
        await trx
          .updateTable('sends')
          .set({ status: 'paused', pause_reason: 'interrupted' })
          .where('id', '=', id)
          .where('status', '=', 'sending')
          .execute();
      });
    },

    /** The person decides about emails that may or may not have gone out. */
    async resolveUncertain(id: Id, action: 'resend' | 'skip'): Promise<number> {
      const result = await db
        .updateTable('send_recipients')
        .set(
          action === 'resend'
            ? { status: 'pending', error_code: null, updated_at: now() }
            : { status: 'skipped', error_code: 'uncertainSkipped', updated_at: now() },
        )
        .where('send_id', '=', id)
        .where('status', '=', 'uncertain')
        .executeTakeFirst();
      return Number(result.numUpdatedRows);
    },

    /** "Retry failed": failed people go back in the queue. */
    async retryFailed(id: Id): Promise<number> {
      const result = await db
        .updateTable('send_recipients')
        .set({ status: 'pending', error_code: null, updated_at: now() })
        .where('send_id', '=', id)
        .where('status', '=', 'failed')
        .executeTakeFirst();
      return Number(result.numUpdatedRows);
    },
  };
  return sends;
}
