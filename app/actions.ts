"use server";

// ALL server actions (T5). Every action is a public HTTP endpoint, so:
// - apart from createTrip and enterPin, each one starts with
//   `const access = await requireParticipant(` or `const access = await requireOrganiser(`
//   (A1; enforced by app/actions.test.ts);
// - every argument is checked at runtime, whatever its TypeScript type says (Q1);
// - the trip, name and device ID come from the signed cookie or the database, never the input;
// - nothing throws to the caller: failures come back as { ok: false, message }.
// Only async functions may be exported from a "use server" file; pure helpers live in
// lib/server/data.ts ("Input validation").

import { revalidatePath } from "next/cache";
import { computeResults } from "@/lib/scoring";
import {
  checkPin,
  clearName,
  currentDeviceId,
  newDeviceId,
  newOrganiserToken,
  newPin,
  newTripId,
  requireOrganiser,
  requireParticipant,
  setJoinCookie,
  type GuardFailure,
} from "@/lib/server/access";
import {
  canSave,
  clearFinal,
  createTrip as insertTrip,
  getDestinations,
  getResponses,
  getTrip,
  parseCreateTripInput,
  parseParticipantName,
  parsePin,
  parseResponseInput,
  pinOutcomeMessage,
  regeneratePin,
  savedAtText,
  setFinal,
  setLockedEarly,
  upsertResponse,
  type SaveCheck,
  type Trip,
} from "@/lib/server/data";

type Fail = { ok: false; message: string };
type Done = { ok: true } | Fail;

const SAVE_FAILED = "Couldn't save. Check your connection and try again.";

const GUARD_MESSAGES: Record<GuardFailure | "bad_token" | "error", string> = {
  no_trip: "This trip link isn't valid.",
  no_cookie: "Please enter the PIN.",
  pin_changed: "The PIN has changed. Ask the organiser for the new one.",
  no_name: "Please pick your name first.",
  bad_token: "This organiser link isn't valid.",
  error: "Couldn't load the trip. Check your connection and try again.",
};

const SAVE_BLOCKED: Record<Extract<SaveCheck, { ok: false }>["reason"], string> = {
  deadline: "The deadline has passed, so answers are locked.",
  locked: "The organiser has locked the trip.",
  final: "A final decision has been made, so answers are locked.",
};

function fail(message: string): Fail {
  return { ok: false, message };
}

/** A guard that threw (e.g. the database is unreachable) refuses, like any other failed guard. */
function guardError(): { ok: false; reason: "error" } {
  return { ok: false, reason: "error" };
}

/** Actions are public endpoints: anything that isn't a string becomes "", which matches nothing. */
function text(x: unknown): string {
  return typeof x === "string" ? x : "";
}

/**
 * Re-render every page that shows this trip. The organiser page is refreshed by
 * route pattern, so friend-side code never needs the organiser token to do it.
 */
/** 32 random bytes in base64url, like newOrganiserToken(). */
const ORGANISER_TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;

function revalidateTrip(trip: Pick<Trip, "id">): void {
  revalidatePath(`/t/${trip.id}`);
  revalidatePath(`/t/${trip.id}/form`);
  revalidatePath("/o/[tripId]/[token]", "page");
}

// ---------------------------------------------------------------------------
// PUBLIC: the only two actions without a guard.
// ---------------------------------------------------------------------------

/** Create a trip. `input` is checked by parseCreateTripInput (see lib/server/data.ts). */
export async function createTrip(
  input: unknown,
): Promise<{ ok: true; tripId: string; pin: string; organiserToken: string } | Fail> {
  const now = new Date();
  const parsed = parseCreateTripInput(input, now);
  if (!parsed.ok) return parsed;
  try {
    const trip = await insertTrip({
      ...parsed.value,
      id: newTripId(),
      pin: newPin(),
      organiserToken: newOrganiserToken(),
    });
    return { ok: true, tripId: trip.id, pin: trip.pin, organiserToken: trip.organiserToken };
  } catch {
    return fail("Couldn't create the trip. Check your connection and try again.");
  }
}

/**
 * Enter the trip PIN. On success the join cookie is set (no name yet).
 * A PIN that isn't 6 digits can never be right, so it is refused without using up one of
 * the group's shared tries: every guess that could actually match is still counted.
 */
export async function enterPin(tripId: string, pin: string): Promise<Done> {
  const now = new Date();
  try {
    const trip = await getTrip(text(tripId));
    if (!trip) return fail(GUARD_MESSAGES.no_trip);
    const parsed = parsePin(pin);
    if (!parsed.ok) return parsed;
    const result = await checkPin(trip.id, parsed.value, now);
    if (result.outcome === "no_trip") return fail(GUARD_MESSAGES.no_trip);
    if (result.outcome !== "ok") return fail(pinOutcomeMessage(result));
    // pinVersion comes from the same atomic check, so a PIN change mid-request can't mint a stale cookie.
    // Keep this phone's device ID if it already had one (e.g. re-entering after a PIN change).
    const deviceId = (await currentDeviceId(trip.id)) ?? newDeviceId();
    await setJoinCookie({ tripId: trip.id, pinVersion: result.pinVersion, deviceId });
    return { ok: true };
  } catch {
    return fail("Couldn't check the PIN. Check your connection and try again.");
  }
}

// ---------------------------------------------------------------------------
// PARTICIPANT: each starts with requireParticipant.
// ---------------------------------------------------------------------------

/**
 * Pick a name. If that name's answers were saved from a different session, ask first
 * ("Is this really you?") and leave the cookie unchanged; the page then calls confirmName.
 */
export async function pickName(
  tripId: string,
  name: string,
): Promise<{ ok: true; needsConfirm: false } | { ok: true; needsConfirm: true; message: string } | Fail> {
  const access = await requireParticipant(text(tripId), { needName: false }).catch(guardError);
  if (!access.ok) return fail(GUARD_MESSAGES[access.reason]);
  const { trip, deviceId } = access;
  const picked = parseParticipantName(name, trip.participantNames);
  if (!picked.ok) return picked;
  try {
    const saved = (await getResponses(trip.id)).find((r) => r.name === picked.value);
    if (saved && saved.deviceId !== deviceId) {
      return {
        ok: true,
        needsConfirm: true,
        message: `${picked.value}'s answers were saved in a different session. Is this really you?`,
      };
    }
    await setJoinCookie({ tripId: trip.id, pinVersion: trip.pinVersion, deviceId, name: picked.value });
    return { ok: true, needsConfirm: false };
  } catch {
    return fail(SAVE_FAILED);
  }
}

/**
 * "Yes, it's me" after pickName asked. Sets the name in the cookie.
 * It deliberately does NOT move the saved response to this device ID: the response becomes
 * this device's only when they SAVE. The form pre-fills the budget only when the saved
 * deviceId equals the cookie's deviceId, so the budget stays hidden until they retype it.
 */
export async function confirmName(tripId: string, name: string): Promise<Done> {
  const access = await requireParticipant(text(tripId), { needName: false }).catch(guardError);
  if (!access.ok) return fail(GUARD_MESSAGES[access.reason]);
  const { trip, deviceId } = access;
  const picked = parseParticipantName(name, trip.participantNames);
  if (!picked.ok) return picked;
  try {
    await setJoinCookie({ tripId: trip.id, pinVersion: trip.pinVersion, deviceId, name: picked.value });
    return { ok: true };
  } catch {
    return fail(SAVE_FAILED);
  }
}

/** "Not you? Switch": drop the name, keep the PIN, and get a new device ID. */
export async function switchName(tripId: string): Promise<Done> {
  const access = await requireParticipant(text(tripId), { needName: false }).catch(guardError);
  if (!access.ok) return fail(GUARD_MESSAGES[access.reason]);
  try {
    await clearName(access.payload);
    return { ok: true };
  } catch {
    return fail(SAVE_FAILED);
  }
}

/**
 * Save (or update) this person's answers. `input` is checked by parseResponseInput.
 * The name and device ID come from the cookie, never from `input`. `input.asName` is the
 * name the page showed; if the cookie now says someone else (Switch in another tab),
 * the save is refused rather than filed under the wrong name.
 */
export async function saveResponse(
  tripId: string,
  input: unknown,
): Promise<{ ok: true; savedAtText: string } | Fail> {
  const access = await requireParticipant(text(tripId), { needName: true }).catch(guardError);
  if (!access.ok) return fail(GUARD_MESSAGES[access.reason]);
  if (access.name === undefined) return fail(GUARD_MESSAGES.no_name);
  const asName = (input as { asName?: unknown } | null)?.asName;
  if (typeof asName === "string" && asName !== access.name) {
    return fail(`You switched to ${access.name} in another tab. Reload this page before saving.`);
  }
  const now = new Date();
  const { trip } = access;
  const allowed = canSave(trip, now);
  if (!allowed.ok) return fail(SAVE_BLOCKED[allowed.reason]);
  const parsed = parseResponseInput(
    input,
    trip.windows.map((w) => w.id),
  );
  if (!parsed.ok) return parsed;
  try {
    await upsertResponse(trip.id, { ...parsed.value, name: access.name }, access.deviceId, now);
    revalidateTrip(trip);
    return { ok: true, savedAtText: savedAtText(now, trip.deadline) };
  } catch {
    return fail(SAVE_FAILED);
  }
}

// ---------------------------------------------------------------------------
// ORGANISER: each starts with requireOrganiser (the token comes from the organiser link).
// ---------------------------------------------------------------------------

/** Lock the trip early: friends can't edit until Unlock. */
export async function lockEarly(tripId: string, token: string): Promise<Done> {
  const access = await requireOrganiser(text(tripId), text(token)).catch(guardError);
  if (!access.ok) return fail(GUARD_MESSAGES[access.reason]);
  try {
    await setLockedEarly(access.trip.id, true);
    revalidateTrip(access.trip);
    return { ok: true };
  } catch {
    return fail(SAVE_FAILED);
  }
}

/** Undo an early lock. Only before the deadline: after it, answers stay locked for good. */
export async function unlock(tripId: string, token: string): Promise<Done> {
  const access = await requireOrganiser(text(tripId), text(token)).catch(guardError);
  if (!access.ok) return fail(GUARD_MESSAGES[access.reason]);
  const now = new Date();
  if (now.getTime() > new Date(access.trip.deadline).getTime()) {
    return fail("The deadline has passed, so the trip can't be unlocked.");
  }
  try {
    await setLockedEarly(access.trip.id, false);
    revalidateTrip(access.trip);
    return { ok: true };
  } catch {
    return fail(SAVE_FAILED);
  }
}

/**
 * The browser picks the new organiser token, so a retry after a lost response is safe:
 * the old token no longer works, but the new one does, because the change was already made.
 * Not exported, so not a server action.
 */
async function alreadyRegenerated(
  tripId: string,
  newToken: string,
  reason: keyof typeof GUARD_MESSAGES,
): Promise<{ ok: true; pin: string; organiserToken: string } | Fail> {
  const done = await requireOrganiser(tripId, newToken).catch(guardError);
  if (done.ok) return { ok: true, pin: done.trip.pin, organiserToken: newToken };
  return fail(GUARD_MESSAGES[reason]);
}

/**
 * New PIN AND new organiser link: old join cookies and the old organiser link stop
 * working, so this recovers even if the organiser link leaked along with the PIN.
 * Returns both so the organiser page can show them and move to the new link.
 */
export async function regeneratePinAction(
  tripId: string,
  token: string,
  newToken: string,
): Promise<{ ok: true; pin: string; organiserToken: string } | Fail> {
  const access = await requireOrganiser(text(tripId), text(token)).catch(guardError);
  if (!access.ok) return alreadyRegenerated(text(tripId), text(newToken), access.reason);
  const next = text(newToken);
  if (!ORGANISER_TOKEN_FORMAT.test(next)) return fail(SAVE_FAILED);
  try {
    const updated = await regeneratePin(access.trip, newPin(), next);
    if (!updated) return fail("Someone else just changed the PIN. Reload to see it.");
    // Not the organiser page: its old-token URL would re-render as "isn't valid" before
    // the client moves to the new link.
    revalidatePath(`/t/${updated.id}`);
    revalidatePath(`/t/${updated.id}/form`);
    return { ok: true, pin: updated.pin, organiserToken: updated.organiserToken };
  } catch {
    return fail(SAVE_FAILED);
  }
}

/**
 * Mark one option as the final choice (SO-3). Only an option currently shown on the
 * results page qualifies, so the results are recomputed here from the database.
 */
export async function markFinal(
  tripId: string,
  token: string,
  destinationId: string,
  windowId: string,
): Promise<Done> {
  const access = await requireOrganiser(text(tripId), text(token)).catch(guardError);
  if (!access.ok) return fail(GUARD_MESSAGES[access.reason]);
  const { trip } = access;
  try {
    const [responses, destinations] = await Promise.all([getResponses(trip.id), getDestinations()]);
    const results = computeResults({
      participants: trip.participantNames,
      responses,
      destinations,
      windows: trip.windows,
    });
    if (results.status === "not_enough") {
      return fail("At least 2 people need to answer before you can pick a final option.");
    }
    const shown = results.shown.some(
      (o) => o.destinationId === text(destinationId) && o.windowId === text(windowId),
    );
    if (!shown) {
      return fail("That option isn't on the results page any more. Reload and pick again.");
    }
    await setFinal(trip.id, text(destinationId), text(windowId));
    revalidateTrip(trip);
    return { ok: true };
  } catch {
    return fail(SAVE_FAILED);
  }
}

/** Clear the final choice. Editing returns unless the trip is locked early or past the deadline (R-3). */
export async function clearFinalAction(tripId: string, token: string): Promise<Done> {
  const access = await requireOrganiser(text(tripId), text(token)).catch(guardError);
  if (!access.ok) return fail(GUARD_MESSAGES[access.reason]);
  try {
    await clearFinal(access.trip.id);
    revalidateTrip(access.trip);
    return { ok: true };
  } catch {
    return fail(SAVE_FAILED);
  }
}
