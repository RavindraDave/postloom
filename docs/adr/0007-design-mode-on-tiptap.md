# ADR 0007: Design mode is built on the same editor as Write mode

- **Status:** Accepted
- **Date:** 2026-09-25
- **Deciders:** Ravindra Dave
- **Refines:** [ADR 0004](0004-email-editor-strategy.md), which named GrapesJS + grapesjs-mjml as the lead candidate for Design mode

## Context
ADR 0004 said the Design-mode library would be confirmed by a short hands-on check. Design mode needs:
- columns (stacking on phones);
- tables;
- "show only if" parts;
- spacers and a footer.

Write-mode letters must keep their words when switching, and the output must go through the same safe pipeline: server-side MJML 5, then Liquid per recipient, with escaping.

The technical check of GrapesJS + grapesjs-mjml raised three problems:
- **MJML versions.** The plugin bundles MJML 4 in the browser, while sending uses MJML 5. Every block would have to be proven identical in both, or the plugin forked.
- **Security rules.** The GrapesJS canvas is a live, same-origin frame that runs component scripts. That clashes with the app's strict CSP and the "no scripts in content" rule, and weakening either would widen the attack surface.
- **Two document formats.** Switching between Write and Design would need converters in both directions, and fidelity would be lost.

## Decision
Build Design mode on **TipTap**, the Write-mode editor, as extra blocks in the **same document schema**:

| Block | Editor | Email |
|---|---|---|
| Columns (2–4) | `columns` › `column` nodes | Their own `mj-section` with `mj-column`s |
| Table | `@tiptap/extension-table`, one or more paragraphs per cell, header row, stripes | `mj-table` |
| Show only if | `conditional` node with a visible frame and rule | Liquid `{% if %}` on validated field and value |
| Space | `spacer` node | `mj-spacer` |
| Footer | `footer` node | small centred `mj-text` |

Write mode and Design mode are the same editor with a different set of tools. A template can go back to Write mode only when it uses no Design blocks, and the app explains why otherwise.

## Consequences
- **Pros:**
  - one schema, one validator (`writeDocumentSchema`) and one MJML converter;
  - no MJML 4, no canvas scripts, no CSP exceptions;
  - personal details, pictures and the checklist work the same in both modes.
- **Cons:**
  - no free drag-and-drop page canvas;
  - column widths are equal;
  - no social icons or custom HTML blocks (HTML import turns HTML into blocks instead).
- **Usability:** the hands-on trial from ADR 0004 still happens, now testing this Design mode (`docs/research/design-mode-trial.md`). If people struggle, the tools change; the document model stays.
