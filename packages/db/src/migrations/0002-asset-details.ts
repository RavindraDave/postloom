import type { Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * Pictures (Phase 3): remember each image's size, so emails can give it the
 * right width, and the name it was picked with, so people recognise it.
 */
export const assetDetails: Migration = {
  async up(db: Kysely<unknown>) {
    await db.schema.alterTable('assets').addColumn('width', 'integer').execute();
    await db.schema.alterTable('assets').addColumn('height', 'integer').execute();
    await db.schema.alterTable('assets').addColumn('name', 'text').execute();
  },
};
