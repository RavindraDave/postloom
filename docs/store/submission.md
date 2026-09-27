# Microsoft Store submission kit

Everything to paste into Partner Center for Postloom, section by section, and
where to get the package. Decision D10: Windows is published through the
Microsoft Store, which signs the package and updates the app.

Store rules that shaped this (checked against Microsoft Learn, September 2026):
the package version can't start with 0 (so the Store launch is **1.0.0**);
desktop screenshots must be PNG and at least 1366 × 768; desktop (Win32 /
Desktop Bridge) apps must always have a privacy policy; `runFullTrust`, which
every Electron app declares, needs a short justification.

## 1. The package

1. Push the tag `v1.0.0` (see [PLAN.md §14.3](../PLAN.md)). The **Release**
   workflow builds everything.
2. When the run finishes, open it in **Actions** and download the
   **store-package** artifact. Inside is `Postloom-1.0.0-win-x64.appx`.
3. It is unsigned on purpose: the Store signs it. Upload the `.appx` as is.

The package identity comes from `apps/desktop/electron-builder.yml` and must
match **Product management → Product identity** in Partner Center:
`R2DSolutions.Postloom`, publisher `CN=29EFD80C-C895-4E06-B83D-288438912DC1`,
publisher display name `R2DSolutions`.

## 2. Pricing and availability

- **Markets:** all markets (or choose).
- **Visibility:** Public audience, discoverable.
- **Pricing:** Free.

## 3. Properties

- **Category:** Productivity. (Business also fits; Productivity is where
  people look for mail tools.)
- **Privacy policy URL:** <https://github.com/RavindraDave/postloom/blob/main/docs/privacy.md>
- **Website:** <https://r2dsolutions.com>
- **Support contact info:** <https://github.com/RavindraDave/postloom/issues>
  (or a support email address for R2DSolutions)
- **Product declarations:** leave "accessibility guidelines" ticked only after
  the by-hand screen-reader pass (PLAN.md); leave the others unticked.
- **System requirements:** none beyond Windows 10 version 1809 or newer.

## 4. Age ratings (IARC questionnaire)

- **Category:** "All other app types".
- **Violence, fear, sexuality, gambling, language, controlled substances,
  crude humour:** No to all.
- **Does the app let users interact or exchange content with other people?**
  Yes: it sends email to the people on the user's own list. (There is no chat,
  no sharing between Postloom users and no content from strangers.)
- **Does it share the user's location?** No.
- **Does it allow digital purchases?** No.
- **Is it a web browser or search engine?** No.

Expected result: suitable for all ages, with a "Users Interact" notice.

## 5. Submission options → Restricted capabilities

`runFullTrust` — paste:

> Postloom is a desktop (Electron) app packaged with the Desktop Bridge. Like
> every Electron app, it runs as a full-trust Win32 process: it needs full trust
> to start its own renderer and sending processes, to open the spreadsheet and
> attachment files that the user picks, to keep the user's email password in
> Windows data protection, and to connect to the user's own email server (SMTP)
> to send the emails they ask it to send. It does not install drivers or
> services, change system settings, or run other programs.

**Notes for certification** — paste:

> Postloom sends personal emails from the user's own email account to a list in
> a spreadsheet. Sending needs an email account: any Gmail account works
> (Home → Connect your email → Gmail → Sign in with Google, or a Gmail app
> password). Outlook.com accounts sign in with Microsoft. Everything
> else can be tried without one: Templates → New template (pick a starter),
> the Write/Design editor, Preview, and Send emails → choose a spreadsheet
> (any .xlsx or .csv with an "Email" column) to see how Postloom reads it. The
> checks and each person's email follow once an account is connected. Nothing is sent without pressing Send now. The Store version
> doesn't check for or download updates itself.

**Publishing:** "Publish this submission as soon as it passes certification",
or pick manual publishing if you want to choose the day.

## 6. Store listing (English)

**Product name:** Postloom (reserved)

**Description:**

> Postloom sends a personal email to everyone on a list, from your own email
> account. Write the email once, leave gaps for details like a first name or an
> invoice number, and Postloom fills them in for each person from your Excel or
> CSV spreadsheet.
>
> It's built for people who aren't technical. A guided setup connects Gmail,
> Outlook, Yahoo, Zoho, iCloud or your company's email in a few minutes, and
> checks it can send before saving it. Gmail and Outlook connect by signing in
> with Google or Microsoft, so Postloom never sees your password. Starter templates for payment
> reminders, invoices, thank-you notes, newsletters and invitations get you
> going, and you can always send yourself a test first.
>
> Before anything goes out, Postloom checks every row: addresses that aren't
> valid, empty details, repeated addresses, people on your "Do not email" list,
> your daily limit and attachments. You can page through each person's own
> email before you press Send.
>
> Sending is safe and steady: one email at a time with a short wait between
> them, pause and carry on whenever you like, and a daily limit that keeps your
> provider happy. If the computer sleeps or the connection drops, Postloom
> pauses and you carry on where it stopped, and nobody gets the same email
> twice.
>
> Your lists, templates and history stay on your computer. Your password is
> protected by Windows. Postloom has no ads, no tracking and no account to
> create.

**What's new in this version:**

> First release in the Microsoft Store.

**Product features** (one per line):

> Personal details from your spreadsheet in every email
> Write like a letter, or design with columns, tables and footers
> Start from a Word document or an HTML email you already have
> Dates and amounts shown properly, like 1 October 2026 or ₹1,24,000
> Text colour, highlight, inbox preview text and sender signatures
> Full-width letters or centred newsletter layouts
> Your own logo, colours and fonts, per sender or per template
> Pictures and attachments that travel inside each email
> Checks every person before anything is sent
> Preview each person's email and send yourself a test
> Pause, carry on and daily limits; nobody gets an email twice
> History of every send, with a report you can save
> Everything stays on your computer; daily backups

**Search terms** (up to 7):

> mail merge, bulk email, personalised email, email from Excel, invoice reminder, newsletter, CSV email

**Screenshots** (upload in this order from [`docs/store/screenshots`](screenshots)),
with captions:

1. `01-home-checklist-light.png` — Three steps from installing to your first send.
2. `02-editor-light.png` — Write your email once, with personal details from your list.
3. `03-design-mode-light.png` — Design mode: columns, tables and parts shown only to some people.
4. `04-send-list-light.png` — Use any Excel or CSV list.
5. `05-send-check-light.png` — Every person is checked, and you can see each email before sending.
6. `06-send-done-light.png` — See who got an email and who didn't, and why.
7. `07-history-light.png` — Every send is kept in History.
8. `08-editor-dark.png` — Dark mode.
9. `09-table-format-light.png` — Tables with your own lines, colours and widths.

Refresh them with
`SCREENSHOTS=1 SCREENSHOTS_SIZE=1920x1080 SCREENSHOTS_OUT=../../docs/store/screenshots-new xvfb-run -a -s "-screen 0 1920x1080x24" pnpm exec playwright test e2e/screenshots.spec.ts`
(in `apps/desktop`), then pick and rename as above.

**Store logos:** optional. The package already carries Postloom's tiles
(`apps/desktop/resources/appx`, made by `scripts/render-icon.mjs`). If Partner
Center asks for a 1:1 logo, use `apps/desktop/resources/icon.png`.

**Copyright:** © 2026 R2DSolutions

**Developed by:** R2DSolutions

## 7. After it's live

- Each later version: bump `apps/desktop/package.json`, push the tag, download
  the new **store-package** artifact and create a new submission with it. The
  Store updates everyone who installed from the Store.
- Once the Store link is known, add it to `docs/install.md` and the README as
  the recommended Windows download.
