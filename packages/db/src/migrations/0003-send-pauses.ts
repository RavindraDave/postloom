import type { Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * Sending (Phase 4): remember why a send paused (the daily limit, a password
 * that stopped working, the computer going to sleep…) so the app can say so
 * after a restart, and find a send's next person quickly.
 */
export const sendPauses: Migration = {
  async up(db: Kysely<unknown>) {
    await db.schema.alterTable('sends').addColumn('pause_reason', 'text').execute();
    await db.schema
      .createIndex('send_recipients_order')
      .on('send_recipients')
      .columns(['send_id', 'row_no'])
      .execute();
  },
};
