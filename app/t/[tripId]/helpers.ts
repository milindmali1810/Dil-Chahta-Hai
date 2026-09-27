// Pure helpers and wording shared by the trip home and the answers form.
// The strings are copies of the ones in app/actions.ts, which can't export them
// (a "use server" file may only export async functions); helpers.test.ts checks
// they stay identical.

import { destinationPhoto, pickPhoto, type Photo } from "@/lib/photos";

export const NO_TRIP = "This trip link isn't valid.";
export const PIN_CHANGED = "The PIN has changed. Ask the organiser for the new one.";
export const LOAD_ERROR = "Couldn't load the trip. Check your connection and try again.";

/** Same shape as SaveCheck in lib/server/data.ts. */
export type SaveCheckLike = { ok: true } | { ok: false; reason: "deadline" | "locked" | "final" };

export const SAVE_BLOCKED: Record<Extract<SaveCheckLike, { ok: false }>["reason"], string> = {
  deadline: "The deadline has passed, so answers are locked.",
  locked: "The organiser has locked the trip.",
  final: "A final decision has been made, so answers are locked.",
};

/** Why answers can't be saved, or null when they can. */
export function lockReason(check: SaveCheckLike): string | null {
  return check.ok ? null : SAVE_BLOCKED[check.reason];
}

/**
 * The header photo, as loadTripView picks it: the chosen destination's photo once a
 * final choice is set, otherwise a stable pick for this trip.
 */
export function tripHeaderPhoto(trip: {
  id: string;
  finalDestinationId: string | null;
  finalWindowId: string | null;
}): Photo {
  const chosen = trip.finalDestinationId && trip.finalWindowId ? destinationPhoto(trip.finalDestinationId) : null;
  return chosen ?? pickPhoto(trip.id);
}
