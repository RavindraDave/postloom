# ADR 0002: Local-first storage with SQLite; secrets in the OS keychain

- **Status:** Accepted (database driver refined by [ADR 0005](0005-node-sqlite.md): built-in `node:sqlite` instead of better-sqlite3)
- **Date:** 2026-09-24
- **Deciders:** Ravindra Dave

## Context
Users send email from their own accounts and handle recipient personal data. A hosted service would have to hold users' email credentials and data, creating a large security and compliance burden. The app must work offline (except for sending) and be simple to install.

## Options considered
1. **Local SQLite** (better-sqlite3 + Kysely) - zero setup, single file, fast, transactional, easy backup.
2. **JSON files** - simple but no transactions or queries; risk of corruption on crash.
3. **Hosted backend** - sync and teams later, but credentials and PII leave the device.

## Decision
- **SQLite** in the per-user app data folder, WAL mode, foreign keys on, versioned forward-only migrations (Kysely migrator), automatic backups before migrations and daily.
- **Secrets** (passwords, OAuth tokens) encrypted with Electron `safeStorage` (Keychain / DPAPI / libsecret) and decrypted only in the main or sending process, never in the renderer.
- No telemetry by default; crash reporting only if the user opts in.

## Consequences
- Multi-device sync and team features are out of scope for 1.0; the `core`/`db` separation keeps a future sync layer possible.
- On Linux without a keyring, `safeStorage` falls back to weak protection; the app must detect this, warn, and offer "don't remember password".
- Database encryption at rest (SQLCipher) is a 1.x option; 1.0 relies on OS disk encryption plus retention controls.
