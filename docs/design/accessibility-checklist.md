# Accessibility checklist

Postloom aims for WCAG 2.2 AA (PLAN.md §4.3). Part of this is checked on every
change; part needs a person with a screen reader before each release.

## Checked automatically (CI, every pull request)

- **axe (WCAG 2.2 A and AA)** on every screen, in light and dark colours
  (`apps/desktop/e2e/accessibility.spec.ts`), and on the screens with real
  content inside the journey tests: Senders & accounts with an account, the
  check step with problems to fix, ready to send, a paused send, the result,
  and History with a send (`expectAccessible` in `e2e/a11y.ts`).
- **Keyboard:** the first Tab reaches "Skip to content", which moves focus to
  the page; after a page change, focus starts in the page.
- **Page names:** the window title names the page ("Settings - Postloom"), so a
  screen reader says where you are.
- **Lint:** `eslint-plugin-jsx-a11y` on all screens.

## Built in

- One live announcement area on the sending screen. It says when sending
  starts, every tenth of the way, and each pause, stop and finish, not every
  email.
- The 10-second wait after "Send now" is announced once. Focus moves to "Don't
  send yet", and the wait can be turned off in Settings (WCAG 2.2.1).
- "Reduce motion" on the computer turns off animations, including the moving
  progress bar.
- Status is never shown by colour alone: every badge and alert has an icon and
  words.

## Before each release (by hand, about 30 minutes)

Use **NVDA on Windows** and **VoiceOver on
macOS**. Go through each item with the keyboard only, with the screen reader
on.

1. First run: complete the setup wizard for "Something else", including a
   wrong password (is the error read out?).
2. Templates: make a template from the gallery, add a detail (merge field)
   and a picture with a description, then undo.
3. Send: pick a list, match a column, look at the problems on the check
   step, leave rows out, step through people's emails, and send a test.
4. Press Send now: is the 10-second wait read out once? Press Don't send yet.
5. Send for real: are the start, progress and "Done" read out, without a
   message for every email? Pause and carry on.
6. History: open a send, and save a report.
7. Settings: change the text size to Largest and check that nothing is cut
   off at 1024×700. Switch to dark colours.
8. Help: search, open a guide, and come back.

Write down anything that is hard to reach, not read out, or read out
confusingly, as an issue labelled `accessibility`.
