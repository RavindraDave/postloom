# Component inventory

Shared components (currently in `apps/desktop/src/renderer/src/components`; they move to `packages/ui` once a second app needs them). Build them (Storybook: light, dark, keyboard focus, and loading/empty/error where relevant) before the screens that use them. Each maps to parts of the design prototype.

| Component | Built on | Used in (prototype screen) | Notes |
|---|---|---|---|
| `AppSidebar` | Mantine AppShell + NavLink | All main screens | ✅ First version done (`layout/AppLayout.tsx`). Needs the account-status card at the bottom. |
| `LoomMark` | SVG | Sidebar, setup, done screens | ✅ Done |
| `PageHeader` | Title + Text | All | ✅ Done, in Storybook. Title, one-line explanation, optional main action |
| `WizardSteps` | Custom list | Setup, Send 1–4 | ✅ Done (setup). Done / current / to-do states; `aria-current="step"` |
| `WizardFooter` | Group | Send 1–4, setup | Back on the left, one primary action on the right, an optional reason when disabled |
| `ChoiceTile` | Radio card | Setup (providers), Send 2 (templates) | ✅ Provider version done (`ProviderPicker`, Mantine `Radio.Card`). Big targets; selected ring + check; keyboard arrow navigation |
| `TemplateCard` | ChoiceTile + thumbnail | Send 2, first-run Home | Badges: "Fits your list", "Needs a … column" |
| `ProblemList` / `ProblemItem` | Custom | Check together, editor checklist | ✅ Editor version done (`editor/ChecklistPanel.tsx`, rules in `@postloom/editor` `checkTemplate`). Severity (must fix / worth a look / all good); one-click fixes still to come |
| `RecipientPreview` | Sandboxed iframe | Check together, editor preview | Person stepper, computer/phone switch; email always light |
| `InheritedField` | Custom row | Senders & accounts | ✅ Done. Value, where it comes from ("Same as the Office Gmail account"), change/lower action |
| `StatusPill` | Custom span | Home, History, accounts | ✅ Done. Success / warning / danger / neutral, text + colour |
| `LimitMeter` | Progress | Home | "312 of 450 left" |
| `ProgressRing` | SVG + `role="progressbar"` | Sending | Percentage, counts, time left |
| `ActivityList` | List | Sending | Sending… / Sent / Didn't go through, plain-language reasons |
| `ConfirmSendDialog` | Modal | Confirm | Summary list, consent checkbox, 10-second cancel countdown |
| `CelebrationPanel` | Custom | All done | Weave animation (reduced motion: static) |
| `FieldChip` | TipTap node view | Write mode, subject line | ✅ In Write mode (the `field` node, styled as a chip). Subject line still to come. `FieldChips` (read-only list) ✅ done |
| `InsertDetailMenu` | Menu | Write mode | ✅ First version: details used so far plus "New detail…". Example values from the spreadsheet come with Phase 4 |
| `ModeSwitch` | SegmentedControl (links) | Editor header | Write / Design |
| `FixPanel` | Alert + steps | Account needs attention | ✅ First version (`FixPasswordForm` in the account card). Explains what happened, check-and-save |
| `EmptyState` | Custom | History, templates | ✅ Done, in Storybook. Loom illustration, one sentence, one action |
| `Toast` | Mantine Notifications | Everywhere | ✅ In use (template bin + Undo) |
| `SkeletonBlock` | Skeleton | Loading states | Only after 500 ms |

## Rules
- One primary (filled teal) button per screen or dialog.
- Every icon-only button has an `aria-label`, and every input has a visible label.
- Disabled buttons say why, next to them.
- Colours only through tokens (`--pl-*` or the Mantine theme); no hex values in components.
