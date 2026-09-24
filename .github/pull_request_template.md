## What & why
<!-- What does this change do, and why? Link the issue. -->

Closes #

## Screenshots / recording
<!-- Required for UI changes: light and dark. -->

## How it was tested
<!-- Unit / component / integration / E2E; manual steps and OS. -->

## Checklist
- [ ] Acceptance criteria met
- [ ] Tests added/updated; coverage gates pass
- [ ] Lint, typecheck and CI green on Windows, macOS, Linux
- [ ] Accessibility: keyboard-only pass, axe clean, light + dark checked
- [ ] Empty, loading and error states handled
- [ ] Strings in i18n files; wording follows the glossary
- [ ] Help text / docs updated
- [ ] Changeset added (user-visible change)
- [ ] ADR added (architectural decision)

### Security (required if this touches IPC, files, sending, secrets, HTML handling or dependencies)
- [ ] IPC input validated with zod; sender frame checked
- [ ] No secrets reach the renderer or logs
- [ ] File access only via user-granted tokens
- [ ] Untrusted HTML sanitized / rendered only in the sandboxed preview
- [ ] New dependency justified (purpose, maintenance, license, size)
