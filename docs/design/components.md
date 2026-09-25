# Component inventory

Shared components to build in `packages/ui` (Storybook: light, dark, keyboard focus, and loading/empty/error where relevant) before the screens that use them. Each maps to parts of the design prototype.

| Component | Built on | Used in (prototype screen) | Notes |
|---|---|---|---|
| `AppSidebar` | Mantine AppShell + NavLink | All main screens | ✅ First version done (`layout/AppLayout.tsx`). Needs the account-status card at the bottom. |
| `LoomMark` | SVG | Sidebar, setup, done screens | ✅ Done |
| `PageHeader` | Title + Text | All | Title, one-line explanation, optional main action |
| `WizardSteps` | Custom list | Send 1–4 | Done / current / to-do states; `aria-current="step"` |
| `WizardFooter` | Group | Send 1–4, setup | Back on the left, one primary action on the right, an optional reason when disabled |
| `ChoiceTile` | Radio card | Setup (providers), Send 2 (templates) | Big targets; selected ring + check; keyboard arrow navigation |
| `TemplateCard` | ChoiceTile + thumbnail | Send 2, first-run Home | Badges: "Fits your list", "Needs a … column" |
| `ProblemList` / `ProblemItem` | Custom | Check together | Severity (must fix / worth a look / info / all good), one-click fixes, undo |
| `RecipientPreview` | Sandboxed iframe | Check together, editor preview | Person stepper, computer/phone switch; email always light |
| `InheritedField` | Custom row | Senders & accounts | Value, where it comes from ("Same as the Office Gmail account"), change/lower action |
| `StatusPill` | Badge | Home, History, accounts | Success / warning / danger / neutral, text + colour |
| `LimitMeter` | Progress | Home | "312 of 450 left" |
| `ProgressRing` | SVG + `role="progressbar"` | Sending | Percentage, counts, time left |
| `ActivityList` | List | Sending | Sending… / Sent / Didn't go through, plain-language reasons |
| `ConfirmSendDialog` | Modal | Confirm | Summary list, consent checkbox, 10-second cancel countdown |
| `CelebrationPanel` | Custom | All done | Weave animation (reduced motion: static) |
| `FieldChip` | TipTap node view | Write mode, subject line | Uses the `field` node from `@postloom/editor` |
| `InsertDetailMenu` | Combobox | Write mode | Lists spreadsheet columns with example values |
| `ModeSwitch` | SegmentedControl (links) | Editor header | Write / Design |
| `FixPanel` | Alert + steps | Account needs attention | Explains what happened, numbered steps, check-and-save |
| `EmptyState` | Custom | History, templates | Loom illustration, one sentence, one action |
| `Toast` | Mantine Notifications | Everywhere | Includes Undo for reversible actions |
| `SkeletonBlock` | Skeleton | Loading states | Only after 500 ms |

## Rules
- One primary (filled teal) button per screen or dialog.
- Every icon-only button has an `aria-label`, and every input has a visible label.
- Disabled buttons say why, next to them.
- Colours only through tokens (`--pl-*` or the Mantine theme); no hex values in components.
