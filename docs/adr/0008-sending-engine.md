# ADR 0008: How the sending engine never emails anyone twice

- **Status:** Accepted
- **Date:** 2026-09-25
- **Deciders:** Ravindra Dave

## Context
Sending is the one thing Postloom must not get wrong. The worst mistakes are emailing someone twice (for example after a crash or a dropped connection) and emailing someone who was left out. The app also must not freeze or crash while hundreds of emails go out, and it must respect the provider's daily limit (PLAN.md §9).

## Decision
**Where it runs.** Each send runs in its own Electron **utility process** (`src/sender`). The main process prepares a *job* for it:
- the send's saved template version, compiled once;
- the sender's details and pictures;
- the account's settings, with the password decrypted just in time. The password stays inside the app's own processes and is never written anywhere.

The sending process opens the same SQLite database (WAL mode lets both processes write) and exits when the send finishes, pauses or stops. The screen reads progress with `sends:get` a few times a second while a send runs. This polling suits local IPC better than a push channel, and keeps the preload API to plain functions.

**States.** Each person is `pending → sending → sent | failed | uncertain` (or `skipped` when left out). The never-twice rules:
1. A person is **claimed** (`pending → sending`, committed) before the server is contacted. The claim is a conditional update, so two processes can never claim the same person.
2. Saving the outcome sits **outside** the send's error handling: if the database can't record a sent email, the engine stops rather than guessing.
3. Only failures where the server **certainly took nothing** are retried:
   - SMTP 4xx ("not now"), or couldn't connect at all;
   - up to 3 tries, with backoff and jitter.
4. A connection lost part-way (a timeout or reset after the email started going out) marks the person **`uncertain`**. These are never retried automatically: the person chooses "Send them again" or "Skip them".
5. After a crash or forced quit, anyone still `sending` becomes `uncertain`, and the send pauses as *interrupted*. The same happens if a sending process dies.
6. A sending process never outlives the app: it checks every second that the app is still running, and exits at once if not. On Windows, killing the app doesn't end its child processes on its own.

**Other failures.**
- 5xx fails the person at once.
- A password that stops working pauses the send (nothing was sent, so the person stays in the queue).
- Three uncertain people in a row pause it, and so does an unreachable server ("circuit breaker").

**Limits and control.**
- The daily limit counts every send from the account (`daily_usage`), per UTC day, and pausing at it is automatic.
- Pause and Stop take effect **between** emails and cut waits short; the email going out at that moment always finishes.
- Only one send per email account runs at a time.
- The computer sleeping pauses sending, and waking carries on.
- Quitting while sending asks first.

**What's sent.** The template is compiled to HTML once per send. Only Liquid runs per person: values are HTML-escaped, and only the row's own details can be read. A send keeps the template version it used, and that version is never pruned.

## Consequences
- A randomised test drives the engine through every kind of server failure, pause and resume, and checks that nobody receives an email twice.
- An E2E test kills the app while an email is in flight and checks the recovery path.
- An `uncertain` person costs the user one decision. That's deliberate: a duplicate email can't be undone, a question can.
- The utility process adds a second database connection. WAL mode and a 5-second busy timeout cover the brief write overlaps.
