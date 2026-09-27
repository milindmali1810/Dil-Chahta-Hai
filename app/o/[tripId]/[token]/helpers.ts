// Pure helpers for the organiser page. No `server-only`: the client controls use some too.

type SaveBlock = { ok: true } | { ok: false; reason: "deadline" | "locked" | "final" };

/** First entry of a comma-separated header value (proxies append), trimmed; null if empty. */
function firstValue(value: string | null): string | null {
  const first = value?.split(",")[0]?.trim();
  return first ? first : null;
}

/**
 * scheme://host of the incoming request, for the absolute trip and organiser links.
 * Prefers the proxy's x-forwarded-* headers (Vercel sets them), then Host.
 */
export function requestOrigin(headers: { get(name: string): string | null }): string {
  const host = firstValue(headers.get("x-forwarded-host")) ?? firstValue(headers.get("host")) ?? "localhost:3000";
  const forwarded = firstValue(headers.get("x-forwarded-proto"));
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  const proto = forwarded === "http" || forwarded === "https" ? forwarded : local ? "http" : "https";
  return `${proto}://${host}`;
}

/** The friends' link that goes in WhatsApp. */
export function tripLink(origin: string, tripId: string): string {
  return `${origin}/t/${encodeURIComponent(tripId)}`;
}

/**
 * Path of the organiser page. `justRegenerated` adds `?new=1`, which makes the page
 * show "Save this link" at the top (after Regenerate PIN, the old link stops working).
 */
export function organiserPath(tripId: string, token: string, justRegenerated = false): string {
  const path = `/o/${encodeURIComponent(tripId)}/${encodeURIComponent(token)}`;
  return justRegenerated ? `${path}?new=1` : path;
}

/** `?new=1` from the page's searchParams (which may be missing or repeated). */
export function isJustRegenerated(value: string | string[] | undefined): boolean {
  return value === "1";
}

/** True once the server's clock is past the deadline (an unparsable deadline counts as passed). */
export function deadlinePassed(deadline: string, now: Date): boolean {
  return !(now.getTime() <= new Date(deadline).getTime());
}

/** "Lock now" makes sense only while not already locked early and before the deadline. */
export function canLockNow(trip: { lockedEarly: boolean; deadline: string }, now: Date): boolean {
  return !trip.lockedEarly && !deadlinePassed(trip.deadline, now);
}

/** "Unlock" is shown when locked early and the deadline hasn't passed (the action checks too). */
export function canUnlockNow(trip: { lockedEarly: boolean; deadline: string }, now: Date): boolean {
  return trip.lockedEarly && !deadlinePassed(trip.deadline, now);
}

/** One line under "Trip controls" saying whether friends can edit, and if not, why. */
export function editingStatus(saveCheck: SaveBlock): string {
  if (saveCheck.ok) return "Friends can still edit their answers.";
  switch (saveCheck.reason) {
    case "deadline":
      return "The deadline has passed, so answers are locked for good.";
    case "locked":
      return "You've locked the trip. Friends can't edit until you unlock.";
    case "final":
      return "A final choice is set, so friends can't edit. Clear it to let them edit again.";
  }
}

/** The Mark-as-final confirmation, e.g. "Mark Goa, 12–16 Dec as the final choice? …". */
export function markFinalQuestion(destinationName: string, windowLabel: string): string {
  return `Mark ${destinationName}, ${windowLabel} as the final choice? Friends' answers will lock.`;
}

/** A new organiser token made in the browser: 32 random bytes in base64url (43 characters). */
export function randomOrganiserToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
