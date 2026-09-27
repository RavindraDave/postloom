import type { Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/** Sender signatures: plain text added at the end of each email from the sender. */
export const senderSignatures: Migration = {
  async up(db: Kysely<unknown>) {
    await db.schema.alterTable('sender_profiles').addColumn('signature', 'text').execute();
  },
};
