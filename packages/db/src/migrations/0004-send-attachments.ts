import type { Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/** Attachments (Phase 4): the files each person gets, as checked when the send started. */
export const sendAttachments: Migration = {
  async up(db: Kysely<unknown>) {
    await db.schema.alterTable('send_recipients').addColumn('attachments_json', 'text').execute();
  },
};
