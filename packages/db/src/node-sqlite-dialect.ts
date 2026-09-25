import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { SqliteDialect, type SqliteDatabase, type SqliteStatement } from 'kysely';

/**
 * Lets Kysely talk to Node's built-in SQLite (`node:sqlite`), which ships
 * inside Electron. Using it instead of a native addon means no per-OS
 * compilation and the same database code in tests and in the app (ADR 0005).
 */
export function nodeSqliteDialect(database: DatabaseSync): SqliteDialect {
  const adapter: SqliteDatabase = {
    close: () => {
      database.close();
    },
    prepare: (sql): SqliteStatement => {
      const statement = database.prepare(sql);
      const bind = (parameters: ReadonlyArray<unknown>) => parameters.map(toSqlValue);
      return {
        reader: statement.columns().length > 0,
        all: (parameters) => statement.all(...bind(parameters)),
        run: (parameters) => statement.run(...bind(parameters)),
        iterate: (parameters) => statement.iterate(...bind(parameters)),
      };
    },
  };
  return new SqliteDialect({ database: adapter });
}

function toSqlValue(value: unknown): SQLInputValue {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'bigint' ||
    value instanceof Uint8Array
  ) {
    return value;
  }
  throw new TypeError(`Unsupported SQLite parameter type: ${typeof value}`);
}
