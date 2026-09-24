# Postloom

**Send beautiful, personalized emails from a spreadsheet - safely, and without needing to be technical.**

Postloom is a cross-platform desktop app (Windows, macOS, Linux) that turns an Excel/CSV list and a template you design visually into individual, personalized emails sent from your own email account. It is designed first for people with little technical background: guided setup, plain language, a drag-and-drop email designer, and safety checks before anything is sent.

> **Status: Phase 0 (foundations).** The app shell, security baseline, email compile/send pipeline and CI are in place; features come next. See the [plan](docs/PLAN.md).
>
> Postloom succeeds [EmailAutomation](https://github.com/RavindraDave/EmailAutomation) (the .NET/Avalonia app), which remains the working tool until Postloom reaches feature parity, and can import its data.

## What it will do (1.0)

- **Guided setup:** pick your email provider (Gmail, Outlook, Yahoo, Zoho, iCloud, other), follow illustrated steps, send yourself a test.
- **Multiple email accounts and sender identities**, with brand kits (logo, colors, fonts) and signatures.
- **Settings that inherit sensibly:** App → Email Account → Sender → Template → this send - and the app always shows where a value came from.
- **Visual template designer:** drag-and-drop blocks, personalization fields from your spreadsheet, show/hide blocks per recipient, desktop/phone preview with real data, version history, starter gallery. Produces email HTML that works in Outlook, Gmail and Apple Mail.
- **Send wizard:** Recipients → Template & Sender → Check → Send. Problems are explained in plain words with a "Fix it" button; always test-send to yourself first.
- **Safe sending engine:** throttling, daily limits, retries, pause/resume, crash-safe (never sends the same email twice), "Do not email" list.
- **History and reports:** per-recipient results, retry failed, CSV export.
- **Local-first and private:** your data stays on your computer (SQLite); passwords are kept in your operating system's secure store.

## Technology

Electron · TypeScript · React · Mantine · GrapesJS/MJML (to be confirmed in Phase 0) · SQLite (better-sqlite3 + Kysely) · Nodemailer · Vitest · Playwright · electron-builder. Rationale: [ADR 0001](docs/adr/0001-electron-typescript.md), [ADR 0002](docs/adr/0002-local-first-sqlite.md).

## Documentation

| Document | Purpose |
|---|---|
| [docs/PLAN.md](docs/PLAN.md) | Full product & engineering plan: UX, architecture, data model, security, testing, CI/CD, roadmap, open decisions |
| [docs/glossary.md](docs/glossary.md) | Fixed user-facing terms and wording rules |
| [docs/adr/](docs/adr/) | Architecture Decision Records |
| [docs/security/threat-model.md](docs/security/threat-model.md) | Threat model and security controls |
| [docs/design/tokens.md](docs/design/tokens.md) · [components.md](docs/design/components.md) | Visual design tokens and the shared component inventory |
| [docs/research/usability-test-plan.md](docs/research/usability-test-plan.md) | How to run the prototype usability test |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How we work: branching, commits, reviews, Definition of Done |
| [SECURITY.md](SECURITY.md) | How to report a vulnerability |

## Roadmap

| Phase | Focus |
|---|---|
| 0 | Foundations & spikes (tooling, CI on 3 OSes, Electron hardening, editor choice) |
| 1 | Core domain, database, app shell, design system, UX prototype |
| 2 | Email accounts & sender profiles, first-run wizard |
| 3 | Template designer |
| 4 | Send wizard & sending engine |
| 5 | History, polish, help, accessibility, EmailAutomation import |
| 6 | Signing, auto-update, beta, 1.0 release |

Details and exit criteria: [PLAN.md §17](docs/PLAN.md#17-roadmap--phases).

## License

To be decided (see [PLAN.md decision D8](docs/PLAN.md#18-open-decisions)). Until a license is added, all rights are reserved.
