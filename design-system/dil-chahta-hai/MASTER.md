# Dil Chahta Hai: Design System (MASTER)

The source of truth for every page in T6. Page files in `pages/` add layout details and override this only where they say so.
Generated 2026-09-26 with /ui-ux-pro-max. **Revision 2: "warmer, more playful"**, as the user asked. The choices below are the tool's recommendations, adjusted where they failed a check; every adjustment is noted.

## 1. Direction

- **Feel:** a friends' holiday, not an office tool. Warm cream, sunset orange for things you *do*, Goa-sea blue for the *decision*, and rounded friendly type.
- **Structure:** Minimalism: one column, content first, lots of breathing room. This is kept from revision 1 because it keeps a 5-person decision readable on a phone.
- **Playful touches (small, deliberate):**
  - a 6px sunset-gradient stripe at the very top of every page. It's the only gradient, borrowed from the tool's "Aurora UI" pick, and it never sits behind text;
  - rounded Fredoka headings;
  - big-radius cards;
  - a gentle "pop" when a choice is ticked.
- **Not used:** full-page Aurora/mesh gradients (text readability risk), the scroll-storytelling landing pattern, GSAP, and stock photos.
- **Phone first:** design at 375px, and check 320px and 768px. Above that, the single column is centred at a max width of 480px. Never scroll sideways, and never disable zoom.

## 2. Colour tokens

Defined once in `app/globals.css` (Tailwind v4 `@theme`). Components use token names only, never raw hex.

| Token | Hex | Use | Contrast (checked) |
|---|---|---|---|
| `--color-bg` | `#FFF7ED` | Page background (warm cream) | — |
| `--color-card` | `#FFFFFF` | Cards, inputs | — |
| `--color-fg` | `#431407` | Main text (deep warm brown) | 14.7 on bg, 15.7 on card |
| `--color-muted-fg` | `#57534E` | Helper text, timestamps | 7.2 on bg, 7.6 on card |
| `--color-primary` | `#C2410C` | Sunset orange: main buttons, links, selected choices | white text 5.2 ✅, as link on bg 4.9 ✅ |
| `--color-primary-pressed` | `#9A3412` | Pressed/hover button | white 7.3 |
| `--color-primary-soft` | `#FFEDD5` | Selected-choice fill (text `#9A3412`, 6.4) | — |
| `--color-decision` | `#0369A1` | Goa-sea blue: "Decided" banner, "Mark as final", focus ring | white 5.9 ✅; ring vs bg 5.6 ✅ |
| `--color-decision-soft` | `#E0F2FE` | Decided banner fill (text `#0C4A6E`, 8.2) | — |
| `--color-success` | `#15803D` | Submitted, passing (soft `#DCFCE7`, text `#166534` 6.5) | 5.0 on card |
| `--color-warning` | `#92400E` | Pending, flagged, "tight" (soft `#FEF3C7`, text `#78350F` 8.2) | 7.1 on card |
| `--color-error` | `#B91C1C` | Field errors (soft `#FEF2F2`, 5.9) | 6.5 on card |
| `--color-border` | `#FED7AA` | Decorative card borders and dividers only | decorative |
| `--color-input-border` | `#78716C` | Borders of inputs, checkboxes and radios | 4.8 on card, 4.5 on bg (needs 3:1) ✅ |
| `--sunset` | `linear-gradient(90deg,#FB923C,#F43F5E,#FBBF24)` | 6px top stripe only | decorative |

**How revision 2 differs from the tool, and why:**
- The tool's warm palette ("Recipe app", terracotta on cream) is applied, but orange becomes the action colour and the travel palette's sky blue becomes the decision colour. The one thing the group is working towards gets its own colour.
- Accent/action: the tool's `#EA580C` gives only 3.6:1 with white text, so it's `#C2410C` (5.2).
- Warning uses amber-800/900, darker than the tool's amber. That keeps it clearly different from the orange buttons, and it always carries a ⚠ icon and a word.

**Rules:**
- Colour is never the only signal. Status always pairs colour with an icon and a word (✓ Submitted, ◷ Pending, ⚠ Flagged).
- Light mode only for v1.

## 3. Typography

- **Headings and wordmark:** **Fredoka** 500–600, rounded and playful (the tool's "Playful Creative" pairing).
- **Body and UI:** **Nunito** 400 / 600 / 700, rounded but very readable at small sizes.
- Load both with `next/font/google`. They're self-hosted at build time, with no requests to Google at runtime and no layout shift.

| Role | Size / line height | Font / weight |
|---|---|---|
| Wordmark | 18 / 24 | Fredoka 600, `--color-primary` |
| Page title (h1) | 30 / 36 | Fredoka 600 |
| Section title (h2) | 20 / 28 | Fredoka 500 |
| Destination on result card | 22 / 28 | Fredoka 600 |
| Body | 16 / 24 | Nunito 400 |
| Labels, buttons | 16 / 24 | Nunito 700 |
| Helper, meta | 14 / 20 | Nunito 400, muted |
| Scores, costs, PIN | 16–28 | Nunito 700, `tabular-nums` |

- Minimum 14px anywhere. Inputs are 16px, so iOS doesn't zoom in.
- Rupees use Indian grouping (`₹12,000` via `toLocaleString("en-IN")`). Only destination costs are shown, never a friend's budget (D2).

## 4. Spacing, shape, elevation

- Spacing (4px base): 4 · 8 · 12 · 16 · 24 · 32 · 48.
  - Page side padding is 16.
  - Gap between cards is 16.
  - Inside a card is 16 (20 on ≥ 400px).
  - Gap between sections is 32.
- Radius (rounder = friendlier): **16px** on cards, **14px** on inputs, buttons and choice cards, full for badges and chips.
- Elevation: a 1px `--color-border` and a soft warm shadow `0 1px 2px rgb(67 20 7 / 0.06), 0 4px 12px rgb(67 20 7 / 0.05)`. No glass or blur.
- Safe areas: add `env(safe-area-inset-bottom)` padding to the sticky save bar.

## 5. Interaction rules (verified /ui-ux-pro-max UX guidance)

| Rule | Spec here | Source guideline |
|---|---|---|
| Touch targets | Everything tappable is at least **48px** tall, with at least **8px** between targets | Touch Target Size (High), Touch Spacing (Medium) |
| Submit feedback | The pressed button shows a spinner plus "Saving…", is disabled while pending, then shows a success or error message | Submit Feedback (High) |
| Errors | Each error sits under its own field, linked with `aria-describedby`. After a failed submit, a summary box at the top (`role="alert"`) gets focus and links to the fields | Error Placement, Focusable Error Summary (High) |
| Not colour alone | Every colour state also has an icon and a word | Color Only (High) |
| Keyboards | Budget and PIN use `inputMode="numeric"`; dates use `type="date"`, time uses `type="time"` | Mobile Keyboards, Input Types |
| Paste allowed | One PIN `<input>`, with paste and password managers allowed | Accessible Authentication (Critical) |
| Motion | 150–200ms transitions on colour, opacity and transform. Ticking a choice card gives a gentle pop (`scale .97 → 1`, 180ms). At most 1–2 animated things per view. **All of it is off under `prefers-reduced-motion`** | Reduced Motion, Excessive Motion (High) |
| Focus | A 2px `--color-decision` blue outline with a 2px offset on every focusable element. It's blue so it shows up against the orange buttons | Accessibility (priority 1) |
| Back button | Each step is its own URL or server-rendered state, so the back button behaves predictably | Back Button (High) |

Forms call the server actions in `app/actions.ts` via `<form action>` plus `useActionState` or `useFormStatus` for pending states (Next.js stack guideline: "use Server Actions for mutations").

## 6. Icons

- SVG only, never emoji as icons.
- About 10 inline SVG components in `app/ui/icons.tsx`, with paths copied from Lucide (ISC licence). No new package is added.
- The icons: `Check`, `Clock`, `AlertTriangle`, `Copy`, `Lock`, `Users`, `Calendar`, `MapPin`, `Loader`, `ChevronRight`.
- Stroke width 2 with rounded ends, which matches the rounded fonts.
- Decorative icons get `aria-hidden="true"`. Icon-only buttons need an accessible label.

## 7. Components (`app/ui/`, reused on every page)

| Component | Look | States |
|---|---|---|
| **Page** | 6px sunset stripe at the top, "Dil Chahta Hai" Fredoka wordmark, single 480px column, 16px sides | — |
| **Button** | Full width on phone, 48px min height, 14px radius, Nunito 700. Variants: **primary** (orange fill, white text), **secondary** (white, orange border and text), **quiet** (orange text only, still 48px tall), **decision** (sea-blue fill, white; only for "Mark as final"), **danger-outline** (red border and text; only for "Lock now") | pressed (darker, `scale .98`), focus ring, pending (spinner + "…ing", disabled), disabled |
| **TextField** | Label above (Nunito 700), 48px white input with a stone-500 border, helper below (muted), error below (red, with icon) | empty, focus, error, read-only when locked |
| **PinField** | One 56px input, 28px Nunito 700 digits with wide spacing, numeric keypad, paste allowed | as TextField, plus "paused" |
| **BudgetField** | "₹" prefix inside, numeric keypad, helpers "Your exact number is never shown to the group. It's only used for scoring." and "Costs assume travel from {city}." | blank when the saved answers came from another session |
| **ChoiceCard** | A whole-row tappable card (at least 48px, 14px radius) with a checkbox or radio on the left and the label | unselected (stone border, white), **selected** (orange border 2px + `--color-primary-soft` fill + ✓ icon + gentle pop), focus, disabled |
| **CopyField** | Label, the value in a cream box, "Copy" secondary button | tapped → "✓ Copied" for 2s (`aria-live="polite"`) |
| **Notice** | Soft-tinted box, 14px radius, icon + text: info (decision-soft), success, warning, error | `role="status"` / `role="alert"` |
| **StatusRow** | Name, Badge, and "updated 9:42 PM" | ✓ Submitted (green), ◷ Pending (amber) |
| **Badge** | Pill, icon + word, 14px Nunito 700 | success, warning, neutral, 🔒 locked, provisional |
| **ResultCard** | White 16px-radius card: "Option 1" chip, destination in Fredoka, "12–16 Dec · ₹12,000 per person", the why-line, average; then person rows (name, score, reason) | passing (✓ green why-line), flagged (warning-soft card, ⚠ + problem line), chosen (2px sea-blue border + "Chosen" badge) |
| **DecisionBanner** | Sea-blue soft block, map-pin icon, Fredoka "Decided: Goa, 12–16 Dec" | only when a final choice is set |
| **ConfirmDialog** | Native `<dialog>`, 16px radius, question + two buttons | "Lock now?", "Is this really you?", "Mark as final?" |
| **SaveThisLink** | Warning Notice around the organiser CopyField | on creation and after Regenerate PIN |

## 8. Voice

Friendly, plain, short. Tell people what to do next. Use the exact strings from the design doc and `app/actions.ts`. A little warmth is fine in headings ("Plan the trip", "Who's going?"), but never in errors.

## 9. Pre-delivery checklist (use at /review checkpoint 3 and /qa-only)

- [ ] No emoji used as icons; all icons are SVG from `app/ui/icons.tsx`
- [ ] Every tappable element is at least 48px tall, with at least 8px between targets
- [ ] Text contrast is at least 4.5:1; input and control borders are at least 3:1 (tokens above)
- [ ] The blue focus ring shows on every focusable element; the whole flow works by keyboard
- [ ] `prefers-reduced-motion` turns off every transition and the pop
- [ ] Works at 320, 375 and 768px, with no sideways scroll and zoom allowed
- [ ] Every status and result state has an icon and a word, not colour alone
- [ ] Every form shows pending, then success or error; errors sit next to their fields
- [ ] No friend's budget appears anywhere except their own form
- [ ] No raw hex in components; tokens only; the sunset gradient appears only in the top stripe
