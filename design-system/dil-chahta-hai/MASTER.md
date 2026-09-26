# Dil Chahta Hai: Design System (MASTER)

The source of truth for every page in T6. Page files in `pages/` add layout details and override this only where they say so.
Generated 2026-09-26 with /ui-ux-pro-max. Choices below are the tool's recommendations, adjusted where they failed a check; every adjustment is noted.

## 1. Direction

- **Style:** Minimalism / Swiss (tool pick, matched by both queries): clean, spacious, high contrast, one column, content first.
- **Feel:** a calm, trustworthy tool with a little holiday warmth. Sky blue is for doing things; sunset orange is for the decision.
- **Not used (tool suggestions that don't fit a 4-page tool):**
  - the "scroll-triggered storytelling" landing-page pattern;
  - GSAP scroll animations (no new animation package);
  - stock or hero photos (the tool's own "avoid: generic photos").
- **Phone first:** friends open links from WhatsApp.
  - Design at 375px wide, and check 320px (small Android) and 768px.
  - On wider screens, the same single column is centred at a max width of 480px.
  - Never scroll sideways, and never disable zoom.

## 2. Colour tokens

Defined once in `app/globals.css` (Tailwind v4 `@theme`), used by name only. No raw hex values in components.

| Token | Hex | Use | Contrast (checked) |
|---|---|---|---|
| `--color-bg` | `#F0F9FF` | Page background | — |
| `--color-card` | `#FFFFFF` | Cards, inputs | — |
| `--color-fg` | `#0C4A6E` | Main text | 9.5 on card, 8.9 on bg |
| `--color-muted-fg` | `#475569` | Helper text, timestamps | 7.6 on card, 7.1 on bg |
| `--color-primary` | `#0369A1` | Main buttons, links, selected choice, focus ring | white text 5.9 ✅ |
| `--color-on-primary` | `#FFFFFF` | Text on primary | — |
| `--color-primary-soft` | `#E0F2FE` | Selected-choice background | — |
| `--color-accent` | `#C2410C` | The decision: "Decided" banner, "Mark final" | white text 5.2 ✅ |
| `--color-accent-soft` | `#FFF7ED` | Banner background (text `#9A3412`, 6.9) | — |
| `--color-success` | `#15803D` | "Submitted", passing option tick | 5.0 on card |
| `--color-warning` | `#B45309` | "Pending", flagged option, "tight on budget" | 5.0 on card |
| `--color-warning-soft` | `#FFFBEB` | Flagged card / warning notice (text `#92400E`, 6.8) | — |
| `--color-error` | `#DC2626` | Field errors | 4.8 on card |
| `--color-error-soft` | `#FEF2F2` | Error notice (text `#B91C1C`, 5.9) | — |
| `--color-border` | `#BAE6FD` | Decorative card borders and dividers only | decorative |
| `--color-input-border` | `#64748B` | Input and checkbox borders (must be visible) | 4.8 (non-text needs 3:1) ✅ |

**Adjustments from the tool's output, and why:**
- Primary: the tool picked `#0EA5E9` (sky-500), but white text on it is only 2.8:1. `#0369A1` (sky-700) is the same hue at 5.9:1.
- Accent: the tool picked `#EA580C`, but white text on it is only 3.6:1. `#C2410C` gives 5.2:1.
- Input border: the tool's border `#BAE6FD` is 1.3:1, too faint to show where a field is. Inputs use `#64748B` instead.

**Rules:**
- Colour is never the only signal. Every status pairs colour with an icon **and** a word: ✓ Submitted, ◷ Pending, ⚠ Flagged.
- Light mode only for v1 (the tool marks it as supported). Dark mode is not in scope.

## 3. Typography

- **Headings:** Calistoga 400 (display serif; the tool's "human warmth" pairing). Use it only for the page title and the destination name on result cards.
- **Everything else:** Inter (400, 500, 600).
- Load both with `next/font/google`. Next self-hosts them at build time, so there are no requests to Google at runtime and no layout shift.
- Scale (px, Tailwind classes):

| Role | Size / line height | Font / weight |
|---|---|---|
| Page title (h1) | 30 / 36 (`text-3xl`) | Calistoga 400 |
| Section title (h2) | 20 / 28 (`text-xl`) | Inter 600 |
| Destination name on card | 22 / 28 | Calistoga 400 |
| Body | 16 / 24 (`text-base`) | Inter 400 |
| Helper, meta, timestamps | 14 / 20 (`text-sm`) | Inter 400, muted |
| Scores, costs, PIN | 16–28 | Inter 600, `tabular-nums` |

- **Minimum 14px anywhere.** Inputs are **16px**, so iOS doesn't zoom in on focus.
- Numbers use Indian grouping, e.g. `₹12,000` via `toLocaleString("en-IN")`. Only destination costs are ever shown; no friend's budget is ever displayed (D2).

## 4. Spacing, shape, elevation

- Spacing scale (4px base): 4 · 8 · 12 · 16 · 24 · 32 · 48.
  - Page side padding is 16.
  - Gap between cards is 16.
  - Inside a card is 16 (20 on ≥ 400px).
  - Gap between sections is 32.
- Radius: 12px on cards, 10px on inputs, buttons and choice cards, full for badges.
- Elevation: a 1px border plus `shadow-sm` on cards. No heavy shadows, gradients or glass effects.
- Safe areas: add `env(safe-area-inset-bottom)` padding to the bottom action bar.

## 5. Interaction rules (from verified /ui-ux-pro-max UX guidance)

| Rule | Spec here | Source guideline |
|---|---|---|
| Touch targets | Every tappable element is at least **48px tall**, with **8px** minimum between targets | Touch Target Size (High), Touch Spacing (Medium) |
| Submit feedback | The pressed button shows a spinner and "Saving…" and is disabled while pending, then gives a success or error message | Submit Feedback (High) |
| Errors | Each error sits **below its field**, linked with `aria-describedby`. After a failed submit, a summary box at the top (`role="alert"`) gets focus and links to the fields | Error Placement (High), Focusable Error Summary (High) |
| Not colour alone | An icon and a word accompany every colour state | Color Only (High) |
| Keyboards | Budget and PIN use `inputMode="numeric"`; dates use `type="date"`, time uses `type="time"` | Mobile Keyboards, Input Types (Medium) |
| Paste allowed | The PIN field accepts paste, uses one `<input>` (not 6 boxes), and allows password managers | Accessible Authentication (Critical) |
| Motion | Only 150–200ms colour, opacity and transform transitions on press and state change. Everything is off under `prefers-reduced-motion`. At most 1–2 animated things per view | Reduced Motion, Excessive Motion (High) |
| Focus | A 2px `--color-primary` outline with a 2px offset on every focusable element. Never remove it | Accessibility (priority 1) |
| Back button | Each step is its own URL or state that the back button respects. Don't trap people in a modal flow | Back Button (High) |

Server actions come from `app/actions.ts` and are called from forms (`<form action={…}>` plus `useActionState` or `useFormStatus` for the pending state). This follows the Next.js stack guideline "use Server Actions for mutations".

## 6. Icons

- Use SVG only, never emoji as icons (tool checklist).
- We need about 10 icons, so they're inline SVG components in one file, `app/ui/icons.tsx`, with paths copied from Lucide (ISC licence). No new package is added for 10 icons.
- The icons: `Check`, `Clock`, `AlertTriangle`, `Copy`, `Lock`, `Users`, `Calendar`, `MapPin`, `Loader` (spinner), `ChevronRight`.
- Decorative icons get `aria-hidden="true"`. An icon-only button always has a text label (visible, or `aria-label`).

## 7. Components (build in `app/ui/`, reuse on every page)

| Component | What it looks like | States |
|---|---|---|
| **Page** | Single column, max width 480, 16 side padding, small "Dil Chahta Hai" wordmark top-left, h1 below | — |
| **Button** | Full width on phone; primary (sky-700 fill, white), secondary (white, primary border and text), quiet (text link style, still 48px tall), accent (orange-700 fill, only for "Mark as final"), danger-outline (only for "Lock now") | default, pressed (slightly darker), focus ring, pending (spinner + verb-ing text, disabled), disabled |
| **TextField** | Label above (Inter 500), 48px input, helper below (muted), error below (red, with icon) | empty, filled, focus, error, read-only (locked) |
| **PinField** | One 48px input, 24px Inter 600 with wide letter spacing, `inputMode="numeric"`, `maxLength={6}`, paste allowed | as TextField, plus "paused: try again in N minutes" |
| **BudgetField** | "₹" prefix inside the field, numeric keypad, helper: "Your exact number is never shown to the group. It's only used for scoring." plus "Costs assume travel from {city}." | as TextField; blank when the saved answers came from another session |
| **ChoiceCard** | A whole-row tappable card (at least 48px) with a checkbox or radio circle on the left and label plus sub-text; used for date windows (checkbox), trip type (radio, 5 options), dealbreakers (checkbox) | unselected (input-border outline), selected (primary border, primary-soft fill, tick icon, not colour alone), focus, disabled (locked) |
| **CopyField** | Label, read-only value in a box, "Copy" secondary button | after tap: the button reads "✓ Copied" for 2s, announced via `aria-live="polite"` |
| **Notice** | Soft-tinted box with icon and text: info (primary-soft), success, warning (warning-soft), error (error-soft) | `role="status"` for info and success, `role="alert"` for errors |
| **StatusRow** | Name, Badge, and "updated 9:42 PM" (muted) | Submitted (green ✓), Pending (amber ◷) |
| **Badge** | Pill: icon plus word, 14px, 600 weight | success, warning, neutral, locked (🔒 icon + "Results (locked)"), provisional |
| **ResultCard** | Rank ("Option 1"), destination (Calistoga), window, "₹12,000 per person", a why-line, average "86.6"; then a list of person rows (name, score, reason) | passing (white card, green ✓ "Everyone can make it"), flagged (warning-soft card, ⚠ "Flagged", problem line), chosen (accent border + "Chosen" badge) |
| **DecisionBanner** | Accent-soft block, map-pin icon: "Decided: Goa, 12–16 Dec" | only when a final choice is set |
| **ConfirmDialog** | Native `<dialog>` with a clear question and two buttons (confirm first) | used for "Lock now?", "Is this really you?" and "Mark as final?" |
| **SaveThisLink** | Warning Notice around the organiser CopyField: "Save this link. It's the only way to lock or finalise the trip." | shown on creation and after Regenerate PIN |

## 8. Voice

Plain, friendly English. Short sentences. Tell people what to do next. Use the exact strings from the design doc and `app/actions.ts` wherever they exist; don't re-word them in the UI.

## 9. Pre-delivery checklist (run at /review checkpoint 3 and /qa-only)

- [ ] No emoji used as icons; all icons are SVG from `app/ui/icons.tsx`
- [ ] Every tappable element is at least 48px tall, with at least 8px between targets
- [ ] Text contrast is at least 4.5:1 and borders of inputs and controls at least 3:1 (tokens above)
- [ ] Visible focus ring on every focusable element; the whole flow works with a keyboard
- [ ] `prefers-reduced-motion` turns off all transitions
- [ ] Works at 320, 375 and 768px, with no sideways scroll and zoom allowed
- [ ] Every status and result state shows an icon and a word, not colour alone
- [ ] Every form shows pending, then success or error; errors sit next to their fields
- [ ] No friend's budget appears on any page except their own form
- [ ] No raw hex in components; tokens only
