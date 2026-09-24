# ADR 0001: Electron + TypeScript for the desktop app

- **Status:** Accepted (to be re-validated by the Phase 0 spike)
- **Date:** 2026-09-24
- **Deciders:** Ravindra Dave

## Context
Postloom must run on Windows, macOS and Linux from one codebase, be usable by non-technical people, and include a rich drag-and-drop **email designer** with accurate previews. The predecessor (EmailAutomation) is .NET 10 + Avalonia; its business logic is small (~2,100 lines plus ~1,500 lines of tests), so reuse is not a decisive factor.

## Options considered
1. **.NET + Photino.Blazor** - keeps C#; reuses MailKit/ClosedXML. Uses each OS's system web engine (WebView2/WKWebView/WebKitGTK), so the designer and previews can render differently per OS; Photino has a small community; the MJML .NET port may drift from the official library.
2. **Electron + TypeScript** - bundled Chromium gives identical rendering everywhere; web editors (GrapesJS, EmailBuilder.js) and the official MJML run natively; mature packaging, signing and auto-update (electron-builder/electron-updater); one language end to end. Larger download (~120-150 MB) and more memory; requires deliberate security hardening; npm supply-chain exposure.
3. **Tauri + TypeScript** - very small bundles; but system web engines (same inconsistency as option 1) and native code in Rust.
4. **Avalonia (stay)** - no mature WYSIWYG HTML email editor available.
5. **Electron UI + .NET sidecar** - two runtimes, IPC between them, harder packaging.

## Decision
**Electron + TypeScript (React)**. Consistent rendering of the designer and previews for non-technical users, native access to the email-editor ecosystem and official MJML, and the most proven cross-platform distribution/update tooling outweigh the larger download.

## Consequences
- The Electron security baseline in PLAN.md §10.2 is mandatory from Phase 0 and enforced by automated tests.
- Dependency hygiene (lockfile, audits, minimal dependencies, blocked install scripts) is a standing requirement.
- Electron must be kept on a supported major version (upgrade within 4 weeks of each release).
- Business logic lives in a pure TypeScript `core` package so it stays portable (e.g. to a future web version).
