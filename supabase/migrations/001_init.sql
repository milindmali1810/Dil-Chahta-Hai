-- 001_init.sql: tables, one-response-per-name rule, deny-all RLS, PIN-failure counter.
-- Source of truth: docs/designs/group-trip-decision-tool.md ("Data model", "Access design", A2).
--
-- Destination rows are NOT inserted here. They come from the hand-checked
-- destination sheet in a separate migration, 002_destinations.sql.

-- ---------------------------------------------------------------------------
-- destinations: the fixed, hand-checked list (about 10 rows).
-- ---------------------------------------------------------------------------
create table public.destinations (
  id                  text primary key,
  name                text not null,
  cost_per_person_inr int  not null check (cost_per_person_inr > 0),
  best_months         int[] not null default '{}'
                      check (best_months <@ array[1,2,3,4,5,6,7,8,9,10,11,12]),
  trip_type           text not null check (trip_type in ('beach', 'hills', 'city', 'adventure')),
  -- Dealbreaker tags this destination carries (see DEALBREAKER_TAGS in lib/scoring.ts).
  attributes          text[] not null default '{}'
);

-- ---------------------------------------------------------------------------
-- trips: one row per trip. The id is a long random string made by the app.
-- The PIN is stored as-is so the organiser page can show it again; the
-- database never reaches the browser.
-- ---------------------------------------------------------------------------
create table public.trips (
  id                   text primary key,
  name                 text not null,
  participant_names    text[] not null,
  -- Array of {id, label, start, end}; start/end are YYYY-MM-DD, both inclusive.
  windows              jsonb not null check (jsonb_typeof(windows) = 'array'),
  -- Full date + time, written by the app with a +05:30 (IST) offset (SO-2).
  deadline             timestamptz not null,
  pin                  text not null check (pin ~ '^[0-9]{6}$'),
  pin_version          int not null default 1,
  organiser_token      text not null,
  locked_early         boolean not null default false,
  -- The final choice is stored as destination + window, never as "rank #1" (SO-3).
  -- It is its own block on saving and never touches locked_early (R-3).
  final_destination_id text references public.destinations (id),
  final_window_id      text,
  failed_pin_tries     int not null default 0,
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
  dealbreakers         text[] not null default '{}',
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

-- ---------------------------------------------------------------------------
-- register_pin_failure: count one wrong PIN in a single atomic UPDATE, so two
-- wrong tries at once can't both slip through. On the 10th wrong try it pauses
-- PIN entry for 15 minutes and resets the counter to 0.
-- ---------------------------------------------------------------------------
create or replace function public.register_pin_failure(p_trip_id text, p_now timestamptz)
returns table (failed_pin_tries int, pin_paused_until timestamptz)
language sql
security invoker
set search_path = ''
as $$
  update public.trips as t
     set failed_pin_tries = case when t.failed_pin_tries + 1 >= 10 then 0
                                 else t.failed_pin_tries + 1 end,
         pin_paused_until = case when t.failed_pin_tries + 1 >= 10 then p_now + interval '15 minutes'
                                 else t.pin_paused_until end
   where t.id = p_trip_id
  returning t.failed_pin_tries, t.pin_paused_until;
$$;

-- Functions are executable by PUBLIC by default, and Supabase also grants
-- anon/authenticated directly, so revoke all three. Only the server calls it.
revoke execute on function public.register_pin_failure(text, timestamptz) from public, anon, authenticated;
grant  execute on function public.register_pin_failure(text, timestamptz) to service_role;
