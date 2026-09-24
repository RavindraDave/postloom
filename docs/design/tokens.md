# Design tokens: "Warm studio"

Source of truth in code: `apps/desktop/src/renderer/src/theme/tokens.ts` (exposed as the Mantine theme and `--pl-*` CSS variables by `theme.ts`). The clickable prototype is the **Postloom UI Design** canvas (private to the owner; ask for access).

## Character
A calm, warm paper background; one deep-teal accent for trust; characterful headings over a friendly, very readable body face; a woven-thread (loom) motif in the brand mark and on dark-teal panels. Generous targets (44px minimum), one primary action per screen.

## Typography

| Role | Font | Notes |
|---|---|---|
| Headings | Bricolage Grotesque (variable), weights 650–750 | Tight tracking (−0.02em) at 22px and above |
| Body & UI | Figtree (variable), 400–700 | Base 15px; captions 13–13.5px, never below 12.5px |
| Code | System monospace | Only in advanced views |

Both are bundled with the app (`@fontsource-variable/*`, SIL Open Font License), so nothing is loaded from the network.

## Colour: light

| Token | Value | Use |
|---|---|---|
| `ground` | `#F6F4EF` | Page background |
| `surface` | `#FFFFFF` | Cards, panels, inputs |
| `sidebar` | `#EDE9E0` | Sidebar, segmented tracks |
| `border` | `#E3DED3` | Hairlines |
| `control` | `#D6D0C3` | Input and secondary-button outlines |
| `ink` | `#1C1B19` | Main text |
| `inkSoft` | `#3D3A35` | Secondary text |
| `muted` | `#6A655C` | Captions (5.3:1 on ground) |
| `loom.7` (primary) | `#0E6B66` | Primary buttons, selection, focus ring (white text 6.4:1) |
| `accentSoft` / `accentInk` | `#E1F0ED` / `#0A4F4B` | Field chips, selected items |

## Colour: dark

| Token | Value |
|---|---|
| `ground` | `#151716` |
| `surface` | `#1E2221` |
| `sidebar` | `#191C1B` |
| `border` / `control` | `#2E3431` / `#3A413E` |
| `ink` / `inkSoft` / `muted` | `#ECE9E2` / `#C9C4BA` / `#A9A397` |
| `accentSoft` / `accentInk` | `#173A37` / `#9FE0D6` |

The email preview always stays light, because that's how recipients see it.

## Status colours
Each pairs a tint with text of at least 4.5:1, and always comes with an icon and words (never colour alone).

| Status | Light (bg / text) | Dark (bg / text) |
|---|---|---|
| Success, "Sent" | `#E3F3EA` / `#1F6B45` | `#163325` / `#7FD6A3` |
| Warning, "Worth a look" | `#FDF1DC` / `#7A4F00` | `#3A2E14` / `#F2C46D` |
| Danger, "Must fix" | `#FDECEA` / `#8F1B12` | `#3A1D1A` / `#FF9E92` |

## Shape & space
Radii: 8 (small controls), 10 (buttons, inputs), 14–16 (cards), 20–24 (hero panels, dialogs). Page padding 40–48px. Gaps: 6/8 within controls, 12–14 within cards, 18–22 between cards.

## Motion
Subtle and purposeful: the loom lines "weave in" once when a send completes; the countdown bar drains during the 10-second cancel window; a spinner or pulse shows while busy. Everything respects "reduce motion".
