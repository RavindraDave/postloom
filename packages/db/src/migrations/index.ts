import type { Migration, MigrationProvider } from 'kysely/migration';
import { initial } from './0001-initial';
import { assetDetails } from './0002-asset-details';

/** All migrations, in order. Names sort lexically, so keep the numeric prefix. */
export const MIGRATIONS: Record<string, Migration> = {
  '0001-initial': initial,
  '0002-asset-details': assetDetails,
};

export const migrationProvider: MigrationProvider = {
  getMigrations: () => Promise.resolve(MIGRATIONS),
};
