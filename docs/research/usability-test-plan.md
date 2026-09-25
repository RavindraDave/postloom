# Usability test plan: clickable prototype (round 1)

**Goal:** before building the real screens, find out whether people with little technical experience can complete Postloom's three core tasks using the prototype, and where they hesitate, get lost or feel anxious.

**What we're testing:** the clickable design prototype ("Postloom UI Design" canvas). **It is private until shared**: open it, choose **Share**, and give each participant a view link (or drive it yourself on a shared screen).

**Success target (from PLAN.md §1):** 4 of 5 participants complete every task without help.

---

## 1. Participants

Recruit **5 people** (5 finds most serious problems; add a second round of 5 after fixes).

| Must | Should | Avoid |
|---|---|---|
| Uses email and Excel at work at least weekly | Mix of ages, including at least one person over 50 | Software developers, designers, IT staff |
| Has sent the same message to many people before (copy-paste, BCC or mail merge) | At least one Windows and one Mac user | Anyone who has seen Postloom |
| Would describe themselves as "not technical" | Office admin, small-business owner, school or society secretary | |

A short screener: *"How often do you send the same email to a list of people? How do you do it today? How comfortable are you with computers, from 1 (not at all) to 5 (very)?"* Choose people answering 1 to 3.

Offer a small thank-you (gift card or equivalent).

## 2. Setup

- 45 minutes per session, remote (video call with screen share) or in person.
- One **facilitator** (talks) and ideally one **note-taker** (silent).
- Record screen and audio **only with written consent** (template in §7).
- Open the prototype in **Play** mode at the starting screen for each task (below). The prototype links screens together; some buttons are for show only. If a participant clicks one, say "that part isn't built yet, what would you expect it to do?" and note the answer.

## 3. Script

**Introduction (3 min)**
> "Thanks for helping. We're testing a new app, not you. There are no wrong answers, and nothing you do can break anything. Please think out loud: say what you're looking at, what you expect, and anything that confuses you. Some parts are a mock-up and won't respond. That's fine. I may not answer questions right away, because I want to see what you'd do on your own."

**Warm-up (3 min)**
> "Tell me about the last time you sent the same email to lots of people. How did it go? What worried you?"

**Tasks (30 min)**: read each scenario aloud and give the participant a printed copy. Don't use words that appear on screen as button labels.

### Task 1: Get set up (start: *First-run setup*)
> "You've just installed this app. You use Gmail at work. Get it ready so you could send emails from your work address."

- **Success:** chooses Gmail and continues; reaches the first-time Home screen.
- **Watch for:** hesitation about which provider, reaction to the "app password" explanation, trust in the privacy note.
- **Ask after:** "What do you think happens to your password?"

### Task 2: Prepare an email (start: *Home: first time*)
> "Your manager asked you to send payment reminders to clients. Create the email you'd send, and make sure each client's name appears in it."

- **Success:** picks a starting point (e.g. Payment reminder), finds **Insert detail**, and understands that "First Name" will become each client's name.
- **Watch for:** do they understand the field chips? Do they look for, or get confused by, Write vs Design? Do they notice "Saved"?
- **Ask after:** "What will Rahul see where it says First Name?" "When would you use Design?"

### Task 3: Send to a list (start: *Send 1: choose people*)
> "You have a spreadsheet of 248 clients with their invoices. Send each of them their September invoice. Stop just before anything would actually go out, or go ahead if you feel sure."

- **Success:** moves through the steps; on "Check together" resolves the must-fix problem (**Skip these 2 people**); on the confirmation, ticks "These people expect to hear from me" and sends; understands the 10-second cancel window.
- **Watch for:** do they read the problem list? Do they understand *why* Send is disabled? Do they use "Send me a test"? Does the confirmation reassure or alarm them?
- **Ask after:** "How sure are you that the right people got the right invoice?" (1 to 5) "If you'd made a mistake, what would you do?"

**Wrap-up (6 min)**
- SUS questionnaire (§5).
- "What was the most confusing moment?" "What would make you trust this app with your real list?" "What would you call the 'Write' and 'Design' modes?"

## 4. What to record per task

| Measure | How |
|---|---|
| Completion | ✅ unaided · 🟡 with a hint · ❌ failed/abandoned |
| Time on task | From reading the scenario to success or giving up |
| Errors / wrong turns | Count and describe each |
| Hints given | Exact words used |
| Confidence | "How easy was that?" 1 (very hard) to 7 (very easy), the Single Ease Question |
| Quotes | Verbatim, especially confusion, worry or delight |

A per-session observation sheet is in §8.

## 5. System Usability Scale (SUS)

Participants rate 1 (strongly disagree) to 5 (strongly agree):

1. I think I would like to use this app frequently.
2. I found the app unnecessarily complex.
3. I thought the app was easy to use.
4. I think I would need help from a technical person to use this app.
5. I found the various parts of the app well connected.
6. I thought there was too much inconsistency in the app.
7. I imagine most people would learn to use this app very quickly.
8. I found the app very awkward to use.
9. I felt very confident using the app.
10. I needed to learn a lot of things before I could get going with this app.

Score: odd items (score − 1), even items (5 − score); sum × 2.5 → 0 to 100. **Target ≥ 80.** Average is 68.

## 6. Analysis

1. After each session, the facilitator and note-taker list every problem seen, with the participant and moment.
2. After all 5, merge duplicates and rate each problem:
   - **Critical**: stopped someone from completing a task, or could cause a wrong send.
   - **Serious**: caused significant delay, a wrong turn or worry for 2+ people.
   - **Minor**: a hesitation or wording quibble.
3. For each Critical and Serious problem, propose a design change, update the prototype, and log the issue with the label `ux-research`.
4. Write a one-page summary: task completion table, SUS average, top 5 problems, changes made. Save it as `docs/research/round-1-findings.md`.

**Go / no-go for building the real screens:** no open Critical problems, and at least 4 of 5 participants completing every task.

## 7. Consent (read and sign)

> I agree to take part in a study of a software prototype. I understand that the session will be recorded (screen and voice) only to help improve the app, that recordings will be kept for at most 90 days and seen only by the project team, and that I can stop at any time without giving a reason. My name will not appear in any report.
>
> Name: ____________ Signature: ____________ Date: ________

## 8. Observation sheet (copy per participant)

```
Participant: P_   Date: ____   Role: ____________   Comfort (1–5): _   OS: ____

Task 1 (setup)       ✅ 🟡 ❌   Time: ____   SEQ (1–7): _
  Wrong turns / hints:
  Quotes:

Task 2 (template)    ✅ 🟡 ❌   Time: ____   SEQ (1–7): _
  Understood field chips? Y / N     Noticed Write/Design? Y / N
  Wrong turns / hints:
  Quotes:

Task 3 (send)        ✅ 🟡 ❌   Time: ____   SEQ (1–7): _
  Read problem list? Y / N   Used "Send me a test"? Y / N   Confidence (1–5): _
  Wrong turns / hints:
  Quotes:

SUS score: ___

Biggest confusion:
Biggest reassurance:
```
