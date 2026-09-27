# Dil Chahta Hai — handoff (for continuing in another Claude session)

Repo: `D:\Dil-Chahta-Hai` · GitHub `milindmali1810/Dil-Chahta-Hai` · work branch `build/v1` · production branch `main`
Stack: Next.js 16 (App Router) + Tailwind v4 + Supabase (server-only, project ref `wnaejeaniqklmmladmjv`, Mumbai) + Vercel.
Spec (source of truth over the PRD): `docs/designs/group-trip-decision-tool.md`. Rules: `CLAUDE.md`, `AGENTS.md`.
Owner is new to coding: explain in plain English. Scope is FIXED by the brief: no new features.

## Status (2026-09-27): DONE and LIVE
- Live app: https://dil-chahta-hai.vercel.app (Vercel auto-deploys every push to `main`).
- `main` = `build/v1`. 243 tests pass, tsc + lint + production build clean.
- Live smoke test passed: create trip → PIN → pick name → save answers (2 friends) → ranked results
  (no budget in page HTML) → organiser Mark as final → "Decided" banner on home and form → keepalive 401 without auth.
- Env vars on Vercel came from `.env.local` (never paste their values in chat).

## Optional follow-ups
1. Rotate the Supabase secret key (it was pasted in chat once): Supabase → Project Settings → API Keys, then update
   SUPABASE_SECRET_KEY in Vercel → Settings → Environment Variables and redeploy.
2. Delete test trips whose names contain "(delete me)" (Supabase table editor → trips).

## Known, deliberately deferred (low)
Create form shows one error at a time; PIN pause only shown after a submit; invalid links return HTTP 200;
photo-credit inline links < 48px; `?new=1` stays in URL after regenerate; focus management after organiser actions;
h2 inside form legends; status time has no date.

## Component map
```
app/
  layout.tsx            fonts (Fredoka/Nunito), tokens from globals.css
  error.tsx             friendly fallback page ("Try again")
  page.tsx              "/" → CreateTrip
  create/               create-trip.tsx (form) · created-screen.tsx (links + PIN) · create-trip-input.ts (form → action input)
  t/[tripId]/           page.tsx picks step: PinStep → NameStep → Home (status + results)
                        pin-step · name-step (+ "Is this really you?" dialog) · switch-row · status-pages · helpers
  t/[tripId]/form/      page.tsx + answers-form.tsx (budget, dates, trip type, dealbreakers) · answers.ts (prefill/parse)
  o/[tripId]/[token]/   organiser page: Share, Who has answered, Results + Mark as final, Trip controls
                        organiser-controls.tsx (lock/unlock/regenerate/final) · helpers.ts
  actions.ts            ALL server actions; each starts with requireParticipant / requireOrganiser
  api/keepalive/        daily Vercel cron ping (bearer CRON_SECRET)
  ui/                   page-shell, photo-header, photo-crossfade, photo-credits, button, submit-button, fields,
                        choice, copy-field, notice, badge, status-list, results, decision-banner, confirm-dialog,
                        save-this-link, icons, format
  dev/                  component preview, 404 in production
lib/
  scoring.ts            pure ranking: floor (blocked / over budget / <40 = flagged) then average
  photos.ts             Wikimedia photos + credits · trip-config.ts (REFERENCE_CITY = Pune)
  server/access.ts      PIN check (try_pin), signed cookie, requireParticipant / requireOrganiser
  server/data.ts        Supabase queries + input validation · server/trip-view.ts (page view model)
supabase/migrations/    001_init.sql (tables, RLS deny-all, try_pin) · 002_destinations.sql (10 places from Pune)
```

Flow: organiser creates trip → gets trip link + PIN + private organiser link → friends open link, enter PIN,
pick name, save answers → results rank destinations → organiser marks the final choice → everyone sees "Decided".
