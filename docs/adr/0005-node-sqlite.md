# ADR 0005: Node's built-in SQLite (`node:sqlite`) instead of better-sqlite3

- **Status:** Accepted
- **Date:** 2026-09-24
- **Deciders:** Ravindra Dave
- **Refines:** [ADR 0002](0002-local-first-sqlite.md), which chose SQLite with better-sqlite3 + Kysely

## Context
better-sqlite3 is a native C++ addon. It must be compiled for Electron's Node ABI to run in the app, and for plain Node's ABI to run in tests. Rebuilding for one breaks the other. It also has to be rebuilt on each operating system, which adds packaging steps and CI time and is a common source of "works on my machine" failures.

Electron 44 ships Node 24.21, which includes `node:sqlite` (`DatabaseSync`, with prepared statements, `iterate`, `columns()`, `VACUUM INTO`).

## Options considered
1. **better-sqlite3.** Mature and fast. Needs native rebuilds for Electron and each OS.
2. **`node:sqlite`.** No native module to build. Identical code in tests and in the app. Still marked *experimental* by Node, so its API could change.
3. **sql.js (WASM).** No native build, but the database lives in memory and must be written out manually, so it's slower and less crash-safe.

## Decision
Use **`node:sqlite`** through a ~40-line Kysely dialect adapter (`packages/db/src/node-sqlite-dialect.ts`). All database code goes through Kysely and the repositories, so the adapter is the only file that touches `node:sqlite` directly.

## Consequences
- No native modules in the app: installers are simpler and CI needs no rebuild step.
- Tests run on Node 22+ (`.nvmrc` is 24, matching Electron). Node prints an "experimental" warning, which is expected.
- **Risk:** a future Node/Electron release changes `node:sqlite`. **Mitigations:**
  - Electron upgrades run the full database test suite (migrations, backups, repositories).
  - If the API breaks, swapping in better-sqlite3 means replacing the adapter only, because both expose the same prepared-statement shape Kysely expects.
- Database files are standard SQLite, so the choice of driver never affects users' data.
