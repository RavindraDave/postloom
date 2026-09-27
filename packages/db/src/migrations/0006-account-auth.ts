import type { Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/** Signing in with Google or Microsoft (OAuth) as well as with a password. */
export const accountAuth: Migration = {
  async up(db: Kysely<unknown>) {
    await db.schema
      .alterTable('email_accounts')
      .addColumn('auth', 'text', (column) => column.notNull().defaultTo('password'))
      .execute();
  },
};
