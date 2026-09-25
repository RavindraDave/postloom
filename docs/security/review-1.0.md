# Security review before beta (Phase 6)

An internal review of Postloom against its [threat model](threat-model.md) and
[PLAN.md §10](../PLAN.md#10-security), done before the first beta. It checks
that each control the threat model relies on exists in the code and has a test.
An external review before the public 1.0 release is still planned.

**Result:** every control checked is in place and tested. There are no open
high or critical findings. The accepted risks are listed at the end, and they
come from decision D10 (unsigned downloads outside the Microsoft Store).

## Controls checked

| Area | What was checked | Where | Tested by |
|---|---|---|---|
| Renderer isolation | `contextIsolation`, `sandbox`, no Node, no `<webview>`, every permission request denied | `main/security.ts` | `e2e/security.spec.ts` |
| Navigation | Leaving the app is blocked; new windows are denied, and only `https:`, `http:` and `mailto:` links go to the computer | `hardenWebContents` | `security.test.ts`, `security.spec.ts` |
| Content Security Policy | No `unsafe-eval`, no inline scripts, `object-src 'none'`, no forms, images only from the app (so a template's remote images can't track the preview) | `main/csp.ts` | `security.spec.ts` |
| IPC | Every channel checks that the sender is the app's own top frame, validates input and output with zod, and returns errors without internals | `main/ipc-router.ts`, `packages/contracts` | `ipc-router.test.ts`, `security.spec.ts` (the full API list and invalid input) |
| App files | The `app://` protocol serves only the bundle; `..` and other hosts are refused | `main/app-protocol.ts` | `security.spec.ts` |
| Email preview | Sandboxed iframe with no scripts and no same-origin access; a hostile template can't reach the app or change the window title | `EmailPreview.tsx` | `security.spec.ts` |
| Passwords | Kept only in the OS keychain (`safeStorage`) and sent to the main process once; never returned to the screen, never in backups, never in diagnostics | `main/secrets.ts`, `db/backups.ts`, `main/diagnostics.ts` | `migration-backup.test.ts`, `diagnostics.test.ts` |
| Email connection | TLS always required (`requireTLS`), including after STARTTLS; certificates verified; TLS 1.2 or newer | `email/smtp.ts` | `smtp.test.ts`, E2E against a STARTTLS test server |
| Header injection | Line breaks refused in the subject, names and addresses, on both one-off and bulk sends | `assertNoHeaderInjection` (`smtp.ts`, `mailer.ts`) | `smtp.test.ts` |
| Personal details in emails | Every value HTML-escaped; a row can read only its own details | `sending/personalise.ts` | `personalise.test.ts` |
| Attachments | Real path followed; private files (keys, `.ssh`, `.env`, keychains, browser stores) blocked; other folders flagged; checked again at send; 18 MB limit | `core/domain/attachments.ts`, `sending/attachments.ts` | unit tests, `attachments.spec.ts` |
| Pictures | Only through the file picker; PNG/JPEG recognised by content; re-encoded without metadata; served with `nosniff` | `main/assets.ts`, `main/images.ts` | unit tests |
| Imported HTML | Sanitised (scripts, event handlers, `javascript:` links, forms, frames removed) | `editor/import-html.ts` | unit tests |
| Reports | CSV cells that start a formula are made safe | `main/report.ts` | `report.test.ts` |
| Sending twice | Claim before sending; only "nothing was sent" failures retried; a lost connection marks the email uncertain, never resent without asking | `sending/engine.ts` (ADR 0008) | `engine.test.ts`, `sending.spec.ts` (killed mid-email) |
| Test-only switches | Every `POSTLOOM_TEST_*` setting and the dev server address are ignored in installed builds | `main/index.ts` | code review (each read is behind `app.isPackaged`) |
| Packaged app | Fuses: no `RunAsNode`, no `NODE_OPTIONS`, no inspector flags, ASAR integrity, load only from ASAR, cookie encryption | `electron-builder.yml` | packaging in CI |
| Dependencies | `pnpm audit` found nothing (production and development) on the reviewed commit; licences allow-listed; Dependabot, CodeQL and dependency review on PRs | `.github/workflows/security.yml` | CI |
| Releases | Checksums for every download; SBOM (SPDX) attached to each release; the tag must match the app version; write access only in the release jobs | `.github/workflows/release.yml` | first tagged release |

## Findings

No high or critical findings. The review changed these things:

- **Threat model updated for decision D10.** It used to assume code signing
  everywhere and automatic updates (electron-updater). Now: the Windows build is
  signed by the Microsoft Store; the macOS and GitHub builds are unsigned, with
  checksums and an SBOM; and outside the Store the app never downloads or runs
  updates itself.
- **SBOM added to releases.** Each release now has an SPDX list of every
  package, from GitHub's dependency graph.
- **Log and crash-report rows corrected.** There are no log files; errors go
  only to the console. Crash reporting isn't built (D7 is open). If it is added,
  it must be opt-in and scrub personal data, with a test.
- **Large-spreadsheet row corrected.** Spreadsheets are read in the main
  process, within the 25 MB and 20,000-row limits, not streamed. The screen
  stays responsive, and this is measured in CI.

## Accepted risks

| Risk | Why accepted | What lowers it |
|---|---|---|
| macOS and GitHub Windows builds aren't signed by a known publisher, so a look-alike download can't be told apart by its signature | D10: no paid certificates for 1.0 | Downloads only from the project's GitHub Releases, with published checksums; the Microsoft Store version for Windows; revisit Apple signing if Mac users grow |
| No automatic updates on macOS, so people may stay on an old version | Updating an unsigned app automatically would mean running unsigned code | A new-version notice (Phase 6) that links to the download page |
| A passwordless, unlocked computer exposes the recipient lists and history in the database | The database isn't encrypted in 1.0 | History retention and "Clear history"; disk encryption guidance in the user guide; optional database encryption is planned for 1.x |

## Still to do

- The new-version notice must only open the Releases page in the browser, and
  must not download or run anything. It needs a test when it's built.
- Build provenance (signed attestations of where each download was built),
  once the attestation action is pinned and reviewed.
- External security review before the public 1.0 release (owner).
