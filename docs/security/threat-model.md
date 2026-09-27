# Threat model

Living document; reviewed at the end of every phase. Controls are specified in [PLAN.md §10](../PLAN.md#10-security).

## System overview
Electron app with a sandboxed renderer (React UI, email designer, sandboxed preview iframe), a preload bridge exposing a minimal typed API, a main process (IPC validation, database, secrets, files, template compilation), and a utility process (sending engine). Data at rest: SQLite in the user's app data folder; secrets encrypted via the OS keychain. Network: outbound SMTP to the user's email provider only (a check for new versions on GitHub is planned; it only links to the download page).

## Trust boundaries
1. Renderer ↔ main (IPC) - renderer content is treated as untrusted.
2. App ↔ files supplied by the user (spreadsheets, HTML, images, attachments) - untrusted input.
3. App ↔ email provider (SMTP/HTTPS) - TLS required.
4. Person ↔ downloaded installer - Windows builds are signed by the Microsoft Store; the GitHub builds are not signed (decision D10), so each has a published SHA-256 checksum.
5. Build pipeline ↔ npm registry / GitHub Actions - supply chain.

## Assets
Email account secrets · recipient personal data · the user's machine · the user's sending reputation and account standing · the update channel · signing keys.

## STRIDE summary

| Threat | Example | Controls |
|---|---|---|
| **Spoofing** | Malicious download or update pretending to be Postloom | Microsoft Store signing on Windows; GitHub Releases over HTTPS with a SHA-256 checksum per file and an SBOM; no automatic updates outside the Store (D10), so the app never downloads or runs code itself |
| | A frame other than the app calling IPC | Validate `event.senderFrame` origin on every handler |
| **Tampering** | Modifying the installed app to exfiltrate secrets | ASAR integrity + OnlyLoadAppFromAsar + RunAsNode-off fuses; Store signing (Windows); ad-hoc signature on macOS, which seals the bundle but doesn't identify the publisher |
| | Header injection from spreadsheet values | Reject CR/LF in header values; strict address parsing |
| **Repudiation** | "Was this email sent?" | Per-recipient log with status, timestamps, provider message-id; frozen resolved settings and template version per send |
| | The same email sent twice after a crash or dropped connection | Claim-before-send (committed); only "nothing was sent" failures retried; lost connections marked uncertain and never resent without asking ([ADR 0008](../adr/0008-sending-engine.md)) |
| **Information disclosure** | Script in imported HTML reads files | Sandboxed renderer, no Node, strict CSP, sanitization, sandboxed preview iframe without scripts |
| | A "picture" that is really a script or document, or a photo leaking its GPS location | Pictures only via the OS file picker; PNG/JPEG recognised by magic bytes; re-encoded (metadata dropped); served only from the app's own store with `nosniff` ([ADR 0006](../adr/0006-images-inside-emails.md)) |
| | Spreadsheet attaches `~/.ssh/id_rsa` and sends it out | Files checked where they really are (shortcuts followed); private files (keys, `.ssh`, `.env`, keychains, browser password stores) blocked and never sent; files from unapproved folders flagged; checked again just before sending; 18 MB per email |
| | A saved report runs a formula when opened in a spreadsheet | Every CSV cell starting with `= + - @`, tab or CR is prefixed with `'` |
| | Passwords in logs or crash reports | No log files; errors go only to the console; diagnostics export has counts and settings only (tested); crash reports not built yet (D7: opt-in, scrubbed, if added) |
| | Lost laptop exposes recipient data | Retention limits; clear-history; OS disk encryption guidance; optional DB encryption (1.x) |
| **Denial of service** | Account locked by sending too fast | Delay between emails, daily limit across all sends per account, one running send per account, circuit breaker |
| | Huge spreadsheet freezes app | 25 MB / 20,000-row limits; parsed in the main process, not the screen (10,000 rows: 0.4 s, screen never blocked over 90 ms, checked in CI) |
| **Elevation of privilege** | XSS in renderer → OS access | contextIsolation, sandbox, nodeIntegration off, narrow preload API, zod-validated IPC, file access via opaque tokens |
| | Compromised npm dependency | Lockfile, frozen installs, install scripts blocked by default, audits, CodeQL, dependency review, minimal deps |

## Open items
- ~~Validate CSP against the chosen editor (Phase 0).~~ Done; no `unsafe-eval`, and remote images are blocked in the app and preview.
- ~~Decide attachment folder-allowlist UX (Phase 4).~~ The list's own folder is trusted; other folders are flagged once, with "trust these folders".
- ~~Internal review before beta~~ (Phase 6): [review-1.0.md](review-1.0.md).
- External security review before the public 1.0 release (owner).
