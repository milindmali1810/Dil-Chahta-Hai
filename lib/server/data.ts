import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DEALBREAKER_TAGS } from "@/lib/scoring";
import type {
  DateWindow,
  DealbreakerTag,
  Destination,
  ParticipantResponse,
  TripTypePref,
} from "@/lib/scoring";

// ---------------------------------------------------------------------------
// Supabase client (server only, secret key, created on first use so that
// `next build` never needs the env vars).
// ---------------------------------------------------------------------------

let client: SupabaseClient | null = null;

export function getDb(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error(
      "Database not configured: set SUPABASE_URL and SUPABASE_SECRET_KEY (see .env.example).",
    );
  }
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

// ---------------------------------------------------------------------------
// Types (camelCase) and the one place that maps them to/from DB rows.
// ---------------------------------------------------------------------------

export interface Trip {
  id: string;
  name: string;
  participantNames: string[];
  windows: DateWindow[];
  /** ISO timestamp, e.g. "2026-09-30T23:59:59+05:30" (or the UTC form Postgres returns). */
  deadline: string;
  pin: string;
  pinVersion: number;
  organiserToken: string;
  lockedEarly: boolean;
  finalDestinationId: string | null;
  finalWindowId: string | null;
  failedPinTries: number;
  pinPausedUntil: string | null;
  createdAt: string;
}

/** A saved response: the scoring input plus who saved it and when. */
export interface StoredResponse extends ParticipantResponse {
  deviceId: string;
  updatedAt: string;
}

export interface NewTrip {
  id: string;
  name: string;
  participantNames: string[];
  windows: DateWindow[];
  deadline: string;
  pin: string;
  organiserToken: string;
}

export interface PinFailureState {
  failedPinTries: number;
  pinPausedUntil: string | null;
}

interface TripRow {
  id: string;
  name: string;
  participant_names: string[];
  windows: DateWindow[];
  deadline: string;
  pin: string;
  pin_version: number;
  organiser_token: string;
  locked_early: boolean;
  final_destination_id: string | null;
  final_window_id: string | null;
  failed_pin_tries: number;
  pin_paused_until: string | null;
  created_at: string;
}

interface ResponseRow {
  trip_id: string;
  participant_name: string;
  budget_inr: number;
  available_window_ids: string[];
  dealbreakers: string[];
  trip_type: string;
  device_id: string;
  updated_at: string;
}

interface DestinationRow {
  id: string;
  name: string;
  cost_per_person_inr: number;
  best_months: number[];
  trip_type: string;
  attributes: string[];
}

function tripFromRow(r: TripRow): Trip {
  return {
    id: r.id,
    name: r.name,
    participantNames: r.participant_names,
    windows: r.windows,
    deadline: r.deadline,
    pin: r.pin,
    pinVersion: r.pin_version,
    organiserToken: r.organiser_token,
    lockedEarly: r.locked_early,
    finalDestinationId: r.final_destination_id,
    finalWindowId: r.final_window_id,
    failedPinTries: r.failed_pin_tries,
    pinPausedUntil: r.pin_paused_until,
    createdAt: r.created_at,
  };
}

function newTripToRow(t: NewTrip) {
  return {
    id: t.id,
    name: t.name,
    participant_names: t.participantNames,
    windows: t.windows,
    deadline: t.deadline,
    pin: t.pin,
    organiser_token: t.organiserToken,
  };
}

function responseFromRow(r: ResponseRow): StoredResponse {
  return {
    name: r.participant_name,
    budgetInr: r.budget_inr,
    availableWindowIds: r.available_window_ids,
    dealbreakers: r.dealbreakers as DealbreakerTag[],
    tripType: r.trip_type as TripTypePref,
    deviceId: r.device_id,
    updatedAt: r.updated_at,
  };
}

function responseToRow(
  tripId: string,
  r: ParticipantResponse,
  deviceId: string,
  now: Date,
): ResponseRow {
  return {
    trip_id: tripId,
    participant_name: r.name,
    budget_inr: r.budgetInr,
    available_window_ids: r.availableWindowIds,
    dealbreakers: r.dealbreakers,
    trip_type: r.tripType,
    device_id: deviceId,
    updated_at: now.toISOString(),
  };
}

function destinationFromRow(r: DestinationRow): Destination {
  return {
    id: r.id,
    name: r.name,
    costPerPersonInr: r.cost_per_person_inr,
    bestMonths: r.best_months,
    tripType: r.trip_type as Destination["tripType"],
    attributes: r.attributes as DealbreakerTag[],
  };
}

// ---------------------------------------------------------------------------
// IST helpers. India has no daylight saving, so a fixed +05:30 offset is exact.
// Nothing here depends on the machine's timezone.
// ---------------------------------------------------------------------------

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Turn the create form's date + time inputs into a stored deadline (SO-2, A4).
 * `toDeadlineIso("2026-09-30", "23:59")` → `"2026-09-30T23:59:59+05:30"`.
 * Throws on anything that isn't a real calendar date and a valid HH:MM.
 */
export function toDeadlineIso(date: string, time: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new Error(`Invalid deadline: ${date} ${time}`);
  }
  // Reject dates like 2026-02-31, which Date would silently roll over.
  const check = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(check.getTime()) || check.toISOString().slice(0, 10) !== date) {
    throw new Error(`Invalid deadline date: ${date}`);
  }
  return `${date}T${time}:59+05:30`;
}

/** e.g. "Wed 30 Sep, 11:59 PM IST". */
export function formatDeadlineIst(deadline: string | Date): string {
  const ms = (typeof deadline === "string" ? new Date(deadline) : deadline).getTime();
  // Shift into IST, then read the UTC fields, so the machine timezone can't matter.
  const d = new Date(ms + IST_OFFSET_MS);
  const h24 = d.getUTCHours();
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ampm = h24 < 12 ? "AM" : "PM";
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${h12}:${mm} ${ampm} IST`;
}

// ---------------------------------------------------------------------------
// Deadline and lock rules (pure; `now` is passed in).
// ---------------------------------------------------------------------------

type LockFields = Pick<Trip, "deadline" | "lockedEarly" | "finalDestinationId" | "finalWindowId">;

export type SaveCheck = { ok: true } | { ok: false; reason: "deadline" | "locked" | "final" };

/*
 * The lock state that canSave and resultsLabel implement:
 *
 *                  ┌── deadline passed? ── yes ──────────────▶ LOCKED (permanent)
 *  trip state ─────┤
 *                  ├── locked early = yes ───────────────────▶ LOCKED  (Unlock → check again)
 *                  ├── final choice set ─────────────────────▶ LOCKED  (Clear final → check again)
 *                  └── none of the above ────────────────────▶ OPEN    label "Provisional: can change until …"
 *  LOCKED → label "Results (locked)"; "Decided: …" banner only when a final choice is set
 */
export function canSave(trip: LockFields, now: Date): SaveCheck {
  // `!(now <= deadline)` also refuses an unparsable deadline (NaN), so it fails closed.
  if (!(now.getTime() <= new Date(trip.deadline).getTime())) return { ok: false, reason: "deadline" };
  if (trip.lockedEarly) return { ok: false, reason: "locked" };
  // R-3: a final choice is its own block and never touches lockedEarly.
  if (trip.finalDestinationId !== null || trip.finalWindowId !== null) {
    return { ok: false, reason: "final" };
  }
  return { ok: true };
}

/** R-1: the label follows exactly the same condition that blocks saving. */
export function resultsLabel(trip: LockFields, now: Date): string {
  return canSave(trip, now).ok
    ? `Provisional: can change until ${formatDeadlineIst(trip.deadline)}`
    : "Results (locked)";
}

// ---------------------------------------------------------------------------
// Thin database calls. No rules here.
// ---------------------------------------------------------------------------

function fail(what: string, error: { message: string }): never {
  throw new Error(`${what} failed: ${error.message}`);
}

export async function getTrip(id: string): Promise<Trip | null> {
  const { data, error } = await getDb().from("trips").select("*").eq("id", id).maybeSingle();
  if (error) fail("getTrip", error);
  return data ? tripFromRow(data as TripRow) : null;
}

export async function getResponses(tripId: string): Promise<StoredResponse[]> {
  const { data, error } = await getDb().from("responses").select("*").eq("trip_id", tripId);
  if (error) fail("getResponses", error);
  return (data as ResponseRow[]).map(responseFromRow);
}

export async function getDestinations(): Promise<Destination[]> {
  const { data, error } = await getDb().from("destinations").select("*").order("name");
  if (error) fail("getDestinations", error);
  return (data as DestinationRow[]).map(destinationFromRow);
}

export async function createTrip(trip: NewTrip): Promise<Trip> {
  const { data, error } = await getDb().from("trips").insert(newTripToRow(trip)).select().single();
  if (error) fail("createTrip", error);
  return tripFromRow(data as TripRow);
}

/** One response per trip + name (FR2): a second save updates the same row. */
export async function upsertResponse(
  tripId: string,
  response: ParticipantResponse,
  deviceId: string,
  now: Date,
): Promise<StoredResponse> {
  const { data, error } = await getDb()
    .from("responses")
    .upsert(responseToRow(tripId, response, deviceId, now), {
      onConflict: "trip_id,participant_name",
    })
    .select()
    .single();
  if (error) fail("upsertResponse", error);
  return responseFromRow(data as ResponseRow);
}

/** Wrong-name guard, "Yes": the saved answers now belong to this device. */
export async function setResponseDeviceId(
  tripId: string,
  participantName: string,
  deviceId: string,
): Promise<void> {
  const { error } = await getDb()
    .from("responses")
    .update({ device_id: deviceId })
    .eq("trip_id", tripId)
    .eq("participant_name", participantName);
  if (error) fail("setResponseDeviceId", error);
}

async function updateTrip(what: string, tripId: string, patch: Partial<TripRow>): Promise<void> {
  const { error } = await getDb().from("trips").update(patch).eq("id", tripId);
  if (error) fail(what, error);
}

export async function setLockedEarly(tripId: string, locked: boolean): Promise<void> {
  await updateTrip("setLockedEarly", tripId, { locked_early: locked });
}

/** SO-3: store which destination + which window. Never touches locked_early (R-3). */
export async function setFinal(
  tripId: string,
  destinationId: string,
  windowId: string,
): Promise<void> {
  await updateTrip("setFinal", tripId, {
    final_destination_id: destinationId,
    final_window_id: windowId,
  });
}

export async function clearFinal(tripId: string): Promise<void> {
  await updateTrip("clearFinal", tripId, { final_destination_id: null, final_window_id: null });
}

/**
 * New PIN, pin_version + 1 (old cookies stop working), tries and pause reset.
 * Only applies if pin_version is still the one the caller read, so two
 * regenerations at once can't both win. Returns null if it lost that race.
 */
export async function regeneratePin(
  trip: Pick<Trip, "id" | "pinVersion">,
  newPin: string,
): Promise<Trip | null> {
  const { data, error } = await getDb()
    .from("trips")
    .update({
      pin: newPin,
      pin_version: trip.pinVersion + 1,
      failed_pin_tries: 0,
      pin_paused_until: null,
    })
    .eq("id", trip.id)
    .eq("pin_version", trip.pinVersion)
    .select()
    .maybeSingle();
  if (error) fail("regeneratePin", error);
  return data ? tripFromRow(data as TripRow) : null;
}

/** One atomic increment in Postgres (see register_pin_failure in 001_init.sql). */
export async function registerPinFailure(tripId: string, now: Date): Promise<PinFailureState> {
  const { data, error } = await getDb()
    .rpc("register_pin_failure", { p_trip_id: tripId, p_now: now.toISOString() })
    .single();
  if (error) fail("registerPinFailure", error);
  const row = data as { failed_pin_tries: number; pin_paused_until: string | null };
  return { failedPinTries: row.failed_pin_tries, pinPausedUntil: row.pin_paused_until };
}

export async function resetPinTries(tripId: string): Promise<void> {
  await updateTrip("resetPinTries", tripId, { failed_pin_tries: 0, pin_paused_until: null });
}

// ---------------------------------------------------------------------------
// Input validation (pure; used by app/actions.ts, Q1).
// Server actions are public HTTP endpoints, so every input arrives as
// `unknown` and is checked here. Messages are plain and shown to the user.
// ---------------------------------------------------------------------------

export type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };

export const TRIP_NAME_MAX = 60;
export const PARTICIPANTS_MIN = 2;
export const PARTICIPANTS_MAX = 10;
export const PARTICIPANT_NAME_MAX = 30;
export const WINDOWS_MIN = 3;
export const WINDOWS_MAX = 4;
export const BUDGET_MAX_INR = 1_000_000;
export const DEFAULT_DEADLINE_TIME = "23:59";
export const TRIP_TYPE_PREFS = [
  "beach",
  "hills",
  "city",
  "adventure",
  "none",
] as const satisfies readonly TripTypePref[];

function bad(message: string): { ok: false; message: string } {
  return { ok: false, message };
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/** Length in characters as a person counts them (an emoji is one, not two). */
function charCount(s: string): number {
  return Array.from(s).length;
}

/** A real calendar date written as YYYY-MM-DD (rejects 2026-02-31). */
export function isCalendarDate(x: unknown): x is string {
  if (typeof x !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(x)) return false;
  const d = new Date(`${x}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === x;
}

/**
 * A readable label for a window of calendar dates (both ends inclusive):
 * "12 Dec", "12–16 Dec", "30 Dec – 3 Jan". Built from the date text itself,
 * so the machine timezone can't shift a day.
 */
export function windowLabel(start: string, end: string): string {
  const [, sm, sd] = start.split("-").map(Number);
  const [, em, ed] = end.split("-").map(Number);
  if (start === end) return `${sd} ${MONTHS[sm - 1]}`;
  if (start.slice(0, 7) === end.slice(0, 7)) return `${sd}–${ed} ${MONTHS[em - 1]}`;
  return `${sd} ${MONTHS[sm - 1]} – ${ed} ${MONTHS[em - 1]}`;
}

/** e.g. "9:42 PM", in IST regardless of the machine timezone. */
export function formatTimeIst(date: Date): string {
  const d = new Date(date.getTime() + IST_OFFSET_MS);
  const h24 = d.getUTCHours();
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${h12}:${mm} ${h24 < 12 ? "AM" : "PM"}`;
}

/** "Saved at 9:42 PM. You can edit until Wed 30 Sep, 11:59 PM IST" */
export function savedAtText(savedAt: Date, deadline: string): string {
  return `Saved at ${formatTimeIst(savedAt)}. You can edit until ${formatDeadlineIst(deadline)}`;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** What a refused PIN attempt tells the user. */
export function pinOutcomeMessage(
  o: { outcome: "wrong"; triesLeft: number } | { outcome: "paused"; minutesLeft: number },
): string {
  return o.outcome === "wrong"
    ? `That PIN isn't right. ${plural(o.triesLeft, "try", "tries")} left.`
    : `Too many wrong tries. Try again in ${plural(o.minutesLeft, "minute", "minutes")}.`;
}

/** The PIN as typed: exactly 6 digits (spaces around a pasted PIN are ignored). */
export function parsePin(pin: unknown): Parsed<string> {
  const p = typeof pin === "string" ? pin.trim() : "";
  return /^\d{6}$/.test(p) ? { ok: true, value: p } : bad("Enter the 6-digit PIN.");
}

/** The name must be exactly one of the trip's participant names. */
export function parseParticipantName(name: unknown, participantNames: string[]): Parsed<string> {
  return typeof name === "string" && participantNames.includes(name)
    ? { ok: true, value: name }
    : bad("Pick your name from the list.");
}

export interface CreateTripValue {
  name: string;
  participantNames: string[];
  windows: DateWindow[];
  /** e.g. "2026-09-30T23:59:59+05:30" */
  deadline: string;
}

/**
 * The create form (Q1, A4). Expects
 * `{ tripName, participantNames: string[], windows: {start, end}[], deadlineDate, deadlineTime? }`
 * with dates as YYYY-MM-DD and the time as HH:MM (IST, default 23:59).
 */
export function parseCreateTripInput(input: unknown, now: Date): Parsed<CreateTripValue> {
  if (!isRecord(input)) return bad("Something's missing. Fill in the form and try again.");

  // Trip name.
  const name = typeof input.tripName === "string" ? input.tripName.trim() : "";
  if (name === "") return bad("Give the trip a name.");
  if (charCount(name) > TRIP_NAME_MAX) {
    return bad(`Keep the trip name to ${TRIP_NAME_MAX} characters or fewer.`);
  }

  // Participants.
  const rawNames = input.participantNames;
  if (!Array.isArray(rawNames) || rawNames.length < PARTICIPANTS_MIN) {
    return bad(`Add at least ${PARTICIPANTS_MIN} people.`);
  }
  if (rawNames.length > PARTICIPANTS_MAX) return bad(`You can add up to ${PARTICIPANTS_MAX} people.`);
  const participantNames: string[] = [];
  const seen = new Set<string>();
  for (const raw of rawNames) {
    const n = typeof raw === "string" ? raw.trim() : "";
    if (n === "") return bad("Names can't be blank.");
    if (charCount(n) > PARTICIPANT_NAME_MAX) {
      return bad(`Keep each name to ${PARTICIPANT_NAME_MAX} characters or fewer.`);
    }
    const key = n.toLowerCase();
    if (seen.has(key)) return bad(`Each name must be different. "${n}" is there twice.`);
    seen.add(key);
    participantNames.push(n);
  }

  // Date windows.
  const rawWindows = input.windows;
  if (
    !Array.isArray(rawWindows) ||
    rawWindows.length < WINDOWS_MIN ||
    rawWindows.length > WINDOWS_MAX
  ) {
    return bad(`Add ${WINDOWS_MIN} or ${WINDOWS_MAX} date options.`);
  }
  const windows: DateWindow[] = [];
  for (const [i, raw] of rawWindows.entries()) {
    const n = i + 1;
    const start = isRecord(raw) ? raw.start : undefined;
    const end = isRecord(raw) ? raw.end : undefined;
    if (typeof start !== "string" || typeof end !== "string" || start === "" || end === "") {
      return bad(`Date option ${n} needs a start and an end date.`);
    }
    if (!isCalendarDate(start) || !isCalendarDate(end)) {
      return bad(`Date option ${n} has a date that doesn't exist.`);
    }
    if (start > end) return bad(`In date option ${n}, the end date is before the start date.`);
    windows.push({ id: `w${n}`, label: windowLabel(start, end), start, end });
  }

  // Deadline (SO-2): an IST date + time, in the future.
  const date = input.deadlineDate;
  const rawTime = input.deadlineTime;
  const time = rawTime === undefined || rawTime === "" ? DEFAULT_DEADLINE_TIME : rawTime;
  if (typeof date !== "string" || date === "") return bad("Pick a deadline date.");
  if (typeof time !== "string") return bad("Pick a real deadline date and time.");
  let deadline: string;
  try {
    deadline = toDeadlineIso(date, time);
  } catch {
    return bad("Pick a real deadline date and time.");
  }
  if (new Date(deadline).getTime() <= now.getTime()) {
    return bad("The deadline must be in the future.");
  }

  return { ok: true, value: { name, participantNames, windows, deadline } };
}

export interface ResponseValue {
  budgetInr: number;
  availableWindowIds: string[];
  dealbreakers: DealbreakerTag[];
  tripType: TripTypePref;
}

/**
 * The participant form (Q1). Expects
 * `{ budgetInr: number, availableWindowIds: string[], dealbreakers: string[], tripType }`.
 * Ticking zero windows is allowed (Q5). No name is read here: it comes from the cookie.
 * The lists come back de-duplicated, in the trip's window order and DEALBREAKER_TAGS order.
 */
export function parseResponseInput(input: unknown, windowIds: string[]): Parsed<ResponseValue> {
  if (!isRecord(input)) return bad("Something's missing. Fill in the form and try again.");

  const budget = input.budgetInr;
  if (
    typeof budget !== "number" ||
    !Number.isInteger(budget) ||
    budget < 1 ||
    budget > BUDGET_MAX_INR
  ) {
    return bad("Enter your budget in whole rupees, from 1 to 10,00,000.");
  }

  const ticked = input.availableWindowIds;
  if (
    !Array.isArray(ticked) ||
    !ticked.every((id) => typeof id === "string" && windowIds.includes(id))
  ) {
    return bad("Some of the dates you ticked aren't options for this trip. Reload and try again.");
  }

  const tags = input.dealbreakers;
  const known: readonly string[] = DEALBREAKER_TAGS;
  if (!Array.isArray(tags) || !tags.every((t) => typeof t === "string" && known.includes(t))) {
    return bad("Some of the dealbreakers you ticked aren't on the list. Reload and try again.");
  }

  const tripType = TRIP_TYPE_PREFS.find((t) => t === input.tripType);
  if (tripType === undefined) return bad('Pick a trip type, or "No preference".');

  return {
    ok: true,
    value: {
      budgetInr: budget,
      availableWindowIds: windowIds.filter((id) => ticked.includes(id)),
      dealbreakers: DEALBREAKER_TAGS.filter((t) => tags.includes(t)),
      tripType,
    },
  };
}
