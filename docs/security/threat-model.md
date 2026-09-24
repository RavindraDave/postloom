# Threat model (initial)

Living document; reviewed at the end of every phase. Controls are specified in [PLAN.md §10](../PLAN.md#10-security).

## System overview
Electron app with a sandboxed renderer (React UI, email designer, sandboxed preview iframe), a preload bridge exposing a minimal typed API, a main process (IPC validation, database, secrets, files, template compilation), and a utility process (sending engine). Data at rest: SQLite in the user's app data folder; secrets encrypted via the OS keychain. Network: outbound SMTP/HTTPS to the user's email provider and the update server only.

## Trust boundaries
1. Renderer ↔ main (IPC) - renderer content is treated as untrusted.
2. App ↔ files supplied by the user (spreadsheets, HTML, images, attachments) - untrusted input.
3. App ↔ email provider (SMTP/HTTPS) - TLS required.
4. App ↔ update server - signed artifacts only.
5. Build pipeline ↔ npm registry / GitHub Actions - supply chain.

## Assets
Email account secrets · recipient personal data · the user's machine · the user's sending reputation and account standing · the update channel · signing keys.

## STRIDE summary

| Threat | Example | Controls |
|---|---|---|
| **Spoofing** | Malicious update pretending to be Postloom | Code signing + notarization; electron-updater signature verification; HTTPS |
| | A frame other than the app calling IPC | Validate `event.senderFrame` origin on every handler |
| **Tampering** | Modifying the installed app to exfiltrate secrets | ASAR integrity + OnlyLoadAppFromAsar fuses; code signing |
| | Header injection from spreadsheet values | Reject CR/LF in header values; strict address parsing |
| **Repudiation** | "Was this email sent?" | Per-recipient log with status, timestamps, provider message-id; frozen resolved settings per send |
| **Information disclosure** | Script in imported HTML reads files | Sandboxed renderer, no Node, strict CSP, sanitization, sandboxed preview iframe without scripts |
| | Spreadsheet attaches `~/.ssh/id_rsa` and sends it out | Attachment review step; folder allowlist; sensitive-path blocklist |
| | Passwords in logs or crash reports | Redaction layer with tests; opt-in crash reports with PII scrubbing |
| | Lost laptop exposes recipient data | Retention limits; clear-history; OS disk encryption guidance; optional DB encryption (1.x) |
| **Denial of service** | Account locked by sending too fast | Throttling, daily limits, circuit breaker |
| | Huge spreadsheet freezes app | Streaming parse, row limits, work off the UI thread |
| **Elevation of privilege** | XSS in renderer → OS access | contextIsolation, sandbox, nodeIntegration off, narrow preload API, zod-validated IPC, file access via opaque tokens |
| | Compromised npm dependency | Lockfile, frozen installs, install scripts blocked by default, audits, CodeQL, dependency review, minimal deps |

## Open items
- Validate CSP against the chosen editor (Phase 0).
- Decide attachment folder-allowlist UX (Phase 4).
- External security review before the public 1.0 release.
