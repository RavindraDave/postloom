# ADR 0004: Email editor: Write mode (TipTap) first, Design mode (block editor) second

- **Status:** Accepted for Write mode; Design mode's library to be confirmed by a hands-on trial in Phase 3
- **Date:** 2026-09-24
- **Deciders:** Ravindra Dave

## Context
The design review ("Council", see the design prototype) found that a three-panel, block-first editor is likely to overwhelm Postloom's main users, who mostly want to *write a letter* and personalise it. The prototype now opens templates in a simple, letter-like **Write mode** with an **Insert detail** menu that adds personal details as chips. Columns, tables and show-only-if rules live in **Design mode**. Plan decision D6 asked for a feasibility check before committing.

Requirements for both modes:
- Personal details appear as inline chips, never as typed `{{…}}` syntax.
- Output must be email-client-safe HTML (MJML), with personalisation filled in per recipient after compiling.
- Typed text and spreadsheet values must never become HTML or template code.
- Must run offline inside the sandboxed renderer (strict CSP, no remote scripts). Licences must be permissive.

## Options considered
**Write mode**
1. **TipTap 3 (ProseMirror), MIT.** Inline atom nodes are first-class, so chips are a small custom node. JSON document output. Mature and accessible editing.
2. Lexical (MIT). Similar capability, less mature schema tooling for JSON validation.
3. GrapesJS rich-text editor. Tied to the block canvas, and weaker at plain letter writing.

**Design mode**
1. **GrapesJS 0.23 + grapesjs-mjml (BSD-3).** A full block canvas. Supports "textable" components (inline components inside text), so chips are possible. **Risk:** `grapesjs-mjml` 1.0.8 bundles `mjml-browser` ^4.18, while the email pipeline uses `mjml` 5.4.
2. **EmailBuilder.js (MIT).** Simpler JSON block model that is friendlier for beginners. Version 0.0.x, so less mature, and it doesn't output MJML.
3. Commercial SDKs (Unlayer, Beefree). Polished but paid, and some need network access, which conflicts with offline use and the CSP.

## Spike results (`packages/editor`)
- A TipTap schema with a custom inline, atomic `field` node and a `button` node builds in Node. The prototype's letter loads into ProseMirror, passes `check()`, and its JSON round-trips exactly into our zod-validated `WriteDocument`.
- `writeDocumentToMjml` compiles with **zero MJML warnings**. Fields become Liquid tags (`{{ row["First Name"] | default: "there" }}`) that survive compilation and are filled per recipient with `outputEscape: 'escape'`.
- Security properties are covered by tests:
  - spreadsheet values are HTML-escaped;
  - typed `{{ … }}` / `{% … %}` text is inert, because braces are entity-encoded;
  - only http(s)/mailto links survive;
  - field names that could break out of a Liquid string are rejected by the schema;
  - unsafe brand values fall back to defaults.
- 23 tests; see `packages/editor/src/*.test.ts`.

## Decision
- **Write mode uses TipTap** with Postloom's `field` and `button` nodes, stores a validated `WriteDocument`, and compiles through `writeDocumentToMjml` → `compileMjml` (server-side MJML 5) → Liquid per recipient.
- **Design mode** keeps the same pipeline contract: it must produce MJML that the *server-side* MJML 5 compiles, with fields expressed as the same Liquid tags. GrapesJS + grapesjs-mjml is the lead candidate. Before building it in Phase 3, run a 1–2 day trial that:
  1. renders a field chip as a textable component inside `mj-text`;
  2. confirms grapesjs-mjml's MJML 4 output compiles identically under MJML 5 for all starter-gallery blocks (or pins/forks the plugin);
  3. runs under the app's CSP;
  4. gets a quick usability check against EmailBuilder.js with 2–3 target users.
- Switching Write → Design converts the `WriteDocument` into Design-mode blocks. Design → Write is offered only when the design uses nothing Write mode can't show; otherwise the app explains why.

## Consequences
- Write mode can be built now (Phase 3 starts here), independent of the Design-mode trial.
- The editor package stays renderer-agnostic: `document.ts` and `to-mjml.ts` have no DOM or TipTap dependency and are reused by the main process for sending.
- The main process must re-validate every stored document with `writeDocumentSchema` before compiling.
- The Liquid settings used in the tests (`outputEscape: 'escape'`, `strictFilters`, `ownPropertyOnly`) become the sending engine's required configuration.
