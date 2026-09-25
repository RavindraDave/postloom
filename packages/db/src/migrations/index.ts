import type { Migration, MigrationProvider } from 'kysely/migration';
import { initial } from './0001-initial';
import { assetDetails } from './0002-asset-details';
import { sendPauses } from './0003-send-pauses';
import { sendAttachments } from './0004-send-attachments';

/** All migrations, in order. Names sort lexically, so keep the numeric prefix. */
export const MIGRATIONS: Record<string, Migration> = {
  '0001-initial': initial,
  '0002-asset-details': assetDetails,
  '0003-send-pauses': sendPauses,
  '0004-send-attachments': sendAttachments,
};

export const migrationProvider: MigrationProvider = {
  getMigrations: () => Promise.resolve(MIGRATIONS),
};
