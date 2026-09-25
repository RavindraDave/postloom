# ADR 0006: Pictures travel inside each email

- **Status:** Accepted
- **Date:** 2026-09-25
- **Deciders:** Ravindra Dave

## Context
Templates need logos and pictures. An email can show a picture in two ways:
1. **Inside the email:** the picture is attached to every message and the HTML points to it with a `cid:` reference.
2. **Linked from the web:** the HTML points to an address where the picture is hosted.

Postloom's users often don't have a website or anywhere to host pictures.

## Options considered
1. **Inside the email (inline attachments).**
   - Pros: works offline, needs nothing to host, and is the most private, because nobody sees when an email is opened.
   - Cons: every email is bigger, so it counts more against provider size limits, and very large pictures can look spammy.
2. **Linked from the web.**
   - Pros: small emails.
   - Cons: needs hosting; many inboxes hide linked pictures until the reader allows them; and loading a picture tells the host that the email was opened.
3. **Both, with linked pictures as an advanced option.** This adds a second path that most users can't use.

## Decision
Pictures always travel **inside the email** (option 1). There is no linked-picture option.

To keep emails light and safe:
- Pictures come only from the computer's own file picker, never from paths chosen by the renderer.
- They are recognised by their first bytes, and only PNG and JPEG are accepted.
- They are re-encoded before storing. Re-encoding drops hidden data such as a photo's location, and refuses anything that merely pretends to be a picture.
- Very wide pictures are shrunk (stored at most 1200px wide, shown at most 600px), and heavy PNGs become JPEGs.
- Each picture is stored once in the database (content hash), so backups include it.
- The checklist asks for a description (alt text) for every picture, and warns when a template's pictures add more than 1 MB to each email.

## Consequences
- The sending engine (Phase 4) attaches each picture once per email, whether it is used as a logo or in the letter.
- The editor and the sandboxed preview load pictures from `app://postloom/assets/<id>`. That route serves only PNG and JPEG pictures that Postloom stored itself, with `nosniff`.
- Emails with many or large pictures grow quickly. The checklist warning and automatic shrinking are the main mitigations.
