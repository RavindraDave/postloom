# Postloom

**Send beautiful, personalized emails from a spreadsheet - safely, and without needing to be technical.**

Postloom is a cross-platform desktop app (Windows, macOS, Linux) that turns an Excel/CSV list and a template you design visually into individual, personalized emails sent from your own email account. It is designed first for people with little technical background: guided setup, plain language, a visual email designer, and safety checks before anything is sent.

> **Status: Phase 6 (release hardening).** Postloom sends personal emails from a spreadsheet today: guided email setup, templates in Write and Design mode, the four-step send with checks, safe sending, History, backups and in-app help. The first build, `v0.1.0`, is ready; downloads appear on the [Releases page](https://github.com/RavindraDave/postloom/releases) once a release is published. See the [plan](docs/PLAN.md) for what's left before 1.0.
>
> Postloom succeeds [EmailAutomation](https://github.com/RavindraDave/EmailAutomation) (the .NET/Avalonia app).

**Using Postloom:** [Install it](docs/install.md), then follow the [user guide](docs/user-guide.md).

## What it does

- **Guided setup:** pick your email provider (Gmail, Outlook, Yahoo, Zoho, iCloud, other), follow illustrated steps, send yourself a test.
- **Multiple email accounts and sender identities**, with brand looks (logo, colour, font).
- **Settings that inherit sensibly:** App → Email Account → Sender → Template → this send - and the app always shows where a value came from.
- **Visual template designer:** Write mode for letters, Design mode for columns, tables and footers, personalization fields from your spreadsheet, show/hide blocks per recipient, desktop/phone preview with real data, version history, starter gallery. Produces email HTML that works in Outlook, Gmail and Apple Mail.
- **Send wizard:** Recipients → Template & Sender → Check → Send. Problems are explained in plain words, each with a way to fix it; always test-send to yourself first.
- **Safe sending engine:** throttling, daily limits, retries, pause/resume, crash-safe (never sends the same email twice), "Do not email" list.
- **History and reports:** per-recipient results, retry failed, CSV export.
- **Local-first and private:** your data stays on your computer (SQLite); passwords are kept in your operating system's secure store.

## Technology

Electron · TypeScript · React · Mantine · TipTap + MJML · SQLite (built-in `node:sqlite` + Kysely) · Nodemailer · Vitest · Playwright · electron-builder. Rationale: [ADRs](docs/adr/) 0001 (Electron), 0002 & 0005 (local SQLite), 0003 (Mantine), 0004 & 0007 (editor).

## Documentation

| Document | Purpose |
|---|---|
| [docs/user-guide.md](docs/user-guide.md) · [install.md](docs/install.md) | For people using Postloom: installing it and everything it does |
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
| 5 | History, polish, help, accessibility |
| 6 | Releases, Microsoft Store, new-version notice, security review, user guide, beta, 1.0 |

Details and exit criteria: [PLAN.md §17](docs/PLAN.md#17-roadmap--phases).

## License

[MIT](LICENSE) © 2026 Ravindra Dave.
