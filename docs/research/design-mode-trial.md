# Design mode: 30-minute hands-on trial

**Goal:** check that people with basic computer skills can use Design mode without help, before we build more on it.

**Who:** 2–3 people who would really use Postloom, for example someone who sends invoices or newsletters from Gmail. Not developers.

**Setup (5 minutes, before they arrive)**
1. Install the latest Postloom build from CI.
2. Connect a test email account, add one sender, and leave one template ("Newsletter" starter).
3. Open Postloom on Home. Have a notepad ready. Don't show them anything first.

**How to run it**
- Say: "We're testing the app, not you. Please think out loud. I can't help, but you can't do anything wrong."
- Read each task aloud. Give them up to 5 minutes per task. Don't point at buttons.
- Note: did they finish? How long did it take? Where did they hesitate? What did they say?

## Tasks
1. **Warm-up.** "Open the Newsletter template and change the heading to your own words."
2. **Columns.** "Put your opening hours on the left and your address on the right, side by side."
   - Success: two columns with text in each.
3. **Table.** "Add a small price list with three items and their prices. Add a fourth item."
   - Success: a table with a header row and 4 rows.
4. **Show only if.** "Only people who have a discount code should see a line with their code."
   - Success: a "show only if Discount has a value" part containing the Discount detail.
5. **Check it.** "See what someone called Rahul, with discount code SAVE10, would get. Then someone with no code."
   - Success: they use Preview → example details and notice the line appear and disappear.
6. **Go back.** "Go back to the simple Write view."
   - Success: they read and understand the message that explains why they can't. Ask them to say in their own words what it means.

## After the tasks (5 minutes)
- "What was hardest?" "What would you call the 'show only if' part?"
- Ask them to rate each statement from 1 (disagree) to 5 (agree): "I could use this without help." "I'd trust it to send to my customers."

## What to do with the results
Create one issue per problem, labelled `ux-research`, with a quote. We will fix any task that fewer than 2 of 3 people finished before building more on Design mode.
