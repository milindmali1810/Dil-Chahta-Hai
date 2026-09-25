@AGENTS.md

# Dil Chahta Hai — group trip decision tool

- Design + eng review (source of truth over the PRD): `docs/designs/group-trip-decision-tool.md`
- Build tasks T1–T8 are listed there under "Implementation Tasks".

## Rules that must hold
- The browser never talks to Supabase. All DB access is server-only (`lib/server/*` imports `server-only`); no `NEXT_PUBLIC_` Supabase env vars.
- Every exported server action in `app/actions.ts` calls `requireParticipant` or `requireOrganiser` first.
- `lib/scoring.ts` is pure: no DB, no `Date.now()`.
- Deadlines are stored with a `+05:30` offset (IST) and checked on the server.

## Testing
- Framework: Vitest (runs on Node, same as Vercel).
- Run all tests: `npm test`
- Watch mode: `npm run test:watch`
