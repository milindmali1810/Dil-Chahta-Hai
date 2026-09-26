-- 001_init.sql: tables, one-response-per-name rule, deny-all RLS, PIN-failure counter.
-- Source of truth: docs/designs/group-trip-decision-tool.md ("Data model", "Access design", A2).
--
-- Destination rows are NOT inserted here. They come from the hand-checked
-- destination sheet in a separate migration, 002_destinations.sql.
-- Write that (and any later sheet edit) as `insert ... on conflict (id) do update`:
-- never delete or truncate destinations, because decided trips reference them.
--
-- The dealbreaker tag list below appears twice (destinations.attributes and
-- responses.dealbreakers) and must equal DEALBREAKER_TAGS in lib/scoring.ts;
-- lib/server/guards.test.ts fails if they drift.

-- ---------------------------------------------------------------------------
-- destinations: the fixed, hand-checked list (about 10 rows).
-- ---------------------------------------------------------------------------
create table public.destinations (
  id                  text primary key,
  name                text not null,
  cost_per_person_inr int  not null check (cost_per_person_inr > 0),
  best_months         int[] not null
                      check (cardinality(best_months) > 0
                             and best_months <@ array[1,2,3,4,5,6,7,8,9,10,11,12]),
  trip_type           text not null check (trip_type in ('beach', 'hills', 'city', 'adventure')),
  -- Dealbreaker tags this destination carries (see DEALBREAKER_TAGS in lib/scoring.ts).
  -- A typo here would silently ignore someone's dealbreaker, so reject unknown tags.
  attributes          text[] not null default '{}'
                      check (attributes <@ array['international', 'trekking', 'overnight_journey']::text[])
);

-- ---------------------------------------------------------------------------
-- trips: one row per trip. The id is a long random string made by the app.
-- The PIN is stored as-is so the organiser page can show it again; the
-- database never reaches the browser.
-- ---------------------------------------------------------------------------
create table public.trips (
  id                   text primary key,
  name                 text not null,
  participant_names    text[] not null
                       check (cardinality(participant_names) >= 2
                              and array_position(participant_names, '') is null),
  -- Array of {id, label, start, end}; start/end are YYYY-MM-DD, both inclusive.
  windows              jsonb not null check (jsonb_typeof(windows) = 'array'),
  -- Full date + time, written by the app with a +05:30 (IST) offset (SO-2).
  deadline             timestamptz not null,
  pin                  text not null check (pin ~ '^[0-9]{6}$'),
  pin_version          int not null default 1 check (pin_version >= 1),
  organiser_token      text not null,
  locked_early         boolean not null default false,
  -- The final choice is stored as destination + window, never as "rank #1" (SO-3).
  -- It is its own block on saving and never touches locked_early (R-3).
  final_destination_id text references public.destinations (id),
  final_window_id      text,
  failed_pin_tries     int not null default 0 check (failed_pin_tries >= 0),
  pin_paused_until     timestamptz,
  created_at           timestamptz not null default now(),
  constraint trips_final_pair check ((final_destination_id is null) = (final_window_id is null))
);

-- ---------------------------------------------------------------------------
-- responses: one row per trip + name (FR2); a second save updates the same row.
-- ---------------------------------------------------------------------------
create table public.responses (
  id                   bigint generated always as identity primary key,
  trip_id              text not null references public.trips (id) on delete cascade,
  participant_name     text not null,
  budget_inr           int not null check (budget_inr > 0),
  available_window_ids text[] not null default '{}',
  dealbreakers         text[] not null default '{}'
                       check (dealbreakers <@ array['international', 'trekking', 'overnight_journey']::text[]),
  trip_type            text not null check (trip_type in ('beach', 'hills', 'city', 'adventure', 'none')),
  device_id            text not null,
  updated_at           timestamptz not null default now(),
  constraint responses_trip_participant_key unique (trip_id, participant_name)
);

-- ---------------------------------------------------------------------------
-- Row Level Security: ON for every table, with ZERO policies (A2).
-- The publishable/anon key can read and write nothing. Only the server's
-- secret key (which bypasses RLS) can reach these tables.
-- ---------------------------------------------------------------------------
alter table public.destinations enable row level security;
alter table public.trips        enable row level security;
alter table public.responses    enable row level security;

-- Explicit table grants, so the schema doesn't depend on project defaults:
-- the browser-facing roles get nothing; only the server's role can read/write.
revoke all on public.trips, public.responses, public.destinations from anon, authenticated;
grant select, insert, update on public.trips, public.responses to service_role;
grant select on public.destinations to service_role;

-- ---------------------------------------------------------------------------
-- try_pin: one PIN attempt, decided entirely inside Postgres.
-- The row lock (FOR UPDATE) makes attempts on the same trip queue up one at a
-- time, so a burst of simultaneous guesses can never test more than
-- p_max_tries PINs before the pause starts, and a correct guess can't clear a
-- pause that an earlier guess in the burst just set.
-- The limits are passed in from MAX_PIN_TRIES / PIN_PAUSE_MINUTES in
-- lib/server/access.ts, so they live in one place.
-- Returns: outcome ('ok' | 'wrong' | 'paused' | 'no_trip'), tries left,
-- when the pause ends, and the trip's current pin_version (for the cookie).
-- ---------------------------------------------------------------------------
create or replace function public.try_pin(
  p_trip_id       text,
  p_pin           text,
  p_now           timestamptz,
  p_max_tries     int,
  p_pause_minutes int
)
returns table (outcome text, tries_left int, paused_until timestamptz, pin_version int)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  t record;
begin
  select tr.pin, tr.pin_version, tr.failed_pin_tries, tr.pin_paused_until
    into t
    from public.trips as tr
   where tr.id = p_trip_id
     for update;

  if not found then
    return query select 'no_trip'::text, 0, null::timestamptz, 0;
    return;
  end if;

  if t.pin_paused_until is not null and t.pin_paused_until > p_now then
    return query select 'paused'::text, 0, t.pin_paused_until, t.pin_version;
    return;
  end if;

  if t.pin = p_pin then
    update public.trips as u
       set failed_pin_tries = 0, pin_paused_until = null
     where u.id = p_trip_id;
    return query select 'ok'::text, p_max_tries, null::timestamptz, t.pin_version;
  elsif t.failed_pin_tries + 1 >= p_max_tries then
    update public.trips as u
       set failed_pin_tries = 0,
           pin_paused_until = p_now + make_interval(mins => p_pause_minutes)
     where u.id = p_trip_id;
    return query select 'paused'::text, 0, p_now + make_interval(mins => p_pause_minutes), t.pin_version;
  else
    update public.trips as u
       set failed_pin_tries = t.failed_pin_tries + 1
     where u.id = p_trip_id;
    return query select 'wrong'::text, p_max_tries - (t.failed_pin_tries + 1), null::timestamptz, t.pin_version;
  end if;
end;
$$;

-- Functions are executable by PUBLIC by default, and Supabase also grants
-- anon/authenticated directly, so revoke all three. Only the server calls it.
revoke execute on function public.try_pin(text, text, timestamptz, int, int) from public, anon, authenticated;
grant  execute on function public.try_pin(text, text, timestamptz, int, int) to service_role;
