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

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
- Author a backlog-ready spec/issue → invoke /spec
