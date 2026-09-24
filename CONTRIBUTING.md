# Contributing to Postloom

## Principles
- **User first:** every change is judged by whether a non-technical user can understand and use it. Follow the [glossary](docs/glossary.md) and UX principles in [PLAN.md §4](docs/PLAN.md#4-ux-principles--design-system).
- **Secure by default:** follow the Electron hardening rules in [PLAN.md §10](docs/PLAN.md#10-security). Never weaken them without an ADR.
- **Tested:** no feature without tests (see [PLAN.md §13](docs/PLAN.md#13-testing-strategy)).

## Setup
- Node.js LTS (see `.nvmrc`) and pnpm (see `packageManager` in `package.json`).
- `pnpm install --frozen-lockfile`
- `pnpm dev` - run the app with hot reload
- `pnpm test` - unit, component and integration tests (`pnpm test:coverage` for coverage)
- `pnpm e2e` - builds the app and runs the Playwright end-to-end and security tests (on headless Linux: `xvfb-run -a pnpm e2e`)
- `pnpm lint` · `pnpm typecheck` · `pnpm format`
- `pnpm package` - unsigned installers for the current OS in `apps/desktop/release/`

## Workflow
- Trunk-based on `main`; short-lived branches named `feat/…`, `fix/…`, `chore/…`, `docs/…`.
- **Conventional Commits** (`feat(designer): add table block`).
- Pull requests: small (aim < 400 changed lines), filled-in PR template, CI green on Windows/macOS/Linux, at least one approving review. Squash-merge.
- Add a **changeset** for user-visible changes.
- Architectural decisions → a new ADR in `docs/adr/` (copy `0000-template.md`).

## Code standards
- TypeScript `strict`; no `any` without a justification comment.
- ESLint + Prettier must pass; architectural boundaries are lint-enforced (`core` has no Electron/Node/React imports; the renderer never imports `db`/`email`/`main`).
- All user-facing text in i18n files; errors follow *what happened → why → what to do*.
- IPC: every channel defined in `packages/contracts` with zod schemas; no generic passthroughs.

## Definition of Done
See [PLAN.md §20](docs/PLAN.md#20-definition-of-done). The PR template contains the checklist.

## Reporting bugs and ideas
Use the issue templates. Security issues: see [SECURITY.md](SECURITY.md).
