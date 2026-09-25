import type { Migration, MigrationProvider } from 'kysely/migration';
import { initial } from './0001-initial';

/** All migrations, in order. Names sort lexically, so keep the numeric prefix. */
export const MIGRATIONS: Record<string, Migration> = {
  '0001-initial': initial,
};

export const migrationProvider: MigrationProvider = {
  getMigrations: () => Promise.resolve(MIGRATIONS),
};
