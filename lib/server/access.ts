import "server-only";

import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getTrip, tryPin, type PinTry, type Trip } from "./data";

// ---------------------------------------------------------------------------
// Random IDs and PINs (node:crypto only).
// ---------------------------------------------------------------------------

/** Long random trip ID for the WhatsApp link (18 bytes → 24 URL-safe chars). */
export function newTripId(): string {
  return randomBytes(18).toString("base64url");
}

/** Private organiser link token (32 bytes). */
export function newOrganiserToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Exactly 6 digits, leading zeros kept. */
export function newPin(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function newDeviceId(): string {
  return randomBytes(16).toString("base64url");
}

// ---------------------------------------------------------------------------
// Signed join cookie (A5): base64url(json).base64url(hmac-sha256).
// ---------------------------------------------------------------------------

export interface JoinPayload {
  tripId: string;
  pinVersion: number;
  name?: string;
  deviceId: string;
}

export const COOKIE_MAX_AGE_SECONDS = 60 * 24 * 60 * 60; // 60 days

export function cookieName(tripId: string): string {
  return `dch_${tripId}`;
}

export const cookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
  maxAge: COOKIE_MAX_AGE_SECONDS,
} as const;

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be set and at least 32 characters (see .env.example).");
  }
  return secret;
}

function sign(body: string): string {
  return createHmac("sha256", sessionSecret()).update(body).digest("base64url");
}

/** Constant-time string comparison (length is checked first, as timingSafeEqual requires). */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Signs the payload, stamping it with the time it was issued (`iat`, seconds). */
export function signPayload(payload: JoinPayload, now: Date = new Date()): string {
  const stamped = { ...payload, iat: Math.floor(now.getTime() / 1000) };
  const body = Buffer.from(JSON.stringify(stamped)).toString("base64url");
  return `${body}.${sign(body)}`;
}

/**
 * Returns the payload only if the signature is valid, the shape is right, and it
 * was issued within the last COOKIE_MAX_AGE_SECONDS (enforced here, not just by
 * the browser, so a copied cookie value expires too). Otherwise null.
 */
export function verifyPayload(
  token: string | null | undefined,
  now: Date = new Date(),
): JoinPayload | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  if (!safeEqual(sig, sign(body))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (
      typeof p?.tripId !== "string" ||
      !Number.isInteger(p.pinVersion) ||
      typeof p.deviceId !== "string" ||
      (p.name !== undefined && typeof p.name !== "string") ||
      !Number.isInteger(p.iat)
    ) {
      return null;
    }
    const ageSeconds = Math.floor(now.getTime() / 1000) - p.iat;
    // Allow 5 minutes of clock skew for a cookie "from the future".
    if (ageSeconds > COOKIE_MAX_AGE_SECONDS || ageSeconds < -300) return null;
    return { tripId: p.tripId, pinVersion: p.pinVersion, name: p.name, deviceId: p.deviceId };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// PIN try limit. The whole attempt (pause check, comparison, counting) runs
// atomically in Postgres (try_pin); these constants are its only settings.
// ---------------------------------------------------------------------------

export const MAX_PIN_TRIES = 10;
export const PIN_PAUSE_MINUTES = 15;

export type PinOutcome =
  | { outcome: "ok"; pinVersion: number }
  | { outcome: "wrong"; triesLeft: number }
  | { outcome: "paused"; minutesLeft: number }
  | { outcome: "no_trip" };

/** Pure: turn try_pin's answer into what the user sees. */
export function pinOutcomeFromDb(r: PinTry, now: Date): PinOutcome {
  switch (r.outcome) {
    case "ok":
      return { outcome: "ok", pinVersion: r.pinVersion };
    case "wrong":
      return { outcome: "wrong", triesLeft: r.triesLeft };
    case "paused": {
      const ms = r.pausedUntil ? new Date(r.pausedUntil).getTime() - now.getTime() : 0;
      return { outcome: "paused", minutesLeft: Math.max(1, Math.ceil(ms / 60_000)) };
    }
    default:
      return { outcome: "no_trip" };
  }
}

/** One PIN attempt for a trip, decided and recorded atomically by the database. */
export async function checkPin(tripId: string, enteredPin: string, now: Date): Promise<PinOutcome> {
  return pinOutcomeFromDb(
    await tryPin(tripId, enteredPin, now, MAX_PIN_TRIES, PIN_PAUSE_MINUTES),
    now,
  );
}

// ---------------------------------------------------------------------------
// Guards.
// ---------------------------------------------------------------------------

export type GuardFailure = "no_trip" | "no_cookie" | "pin_changed" | "no_name";

export type GuardResult =
  | { ok: true; name?: string; deviceId: string }
  | { ok: false; reason: GuardFailure };

/** Pure: may this cookie act on this trip? */
export function guardDecision(
  payload: JoinPayload | null,
  trip: Pick<Trip, "id" | "pinVersion" | "participantNames"> | null,
  opts: { needName: boolean },
): GuardResult {
  if (!trip) return { ok: false, reason: "no_trip" };
  if (!payload || payload.tripId !== trip.id) return { ok: false, reason: "no_cookie" };
  if (payload.pinVersion !== trip.pinVersion) return { ok: false, reason: "pin_changed" };
  const name =
    payload.name !== undefined && trip.participantNames.includes(payload.name)
      ? payload.name
      : undefined;
  if (opts.needName && name === undefined) return { ok: false, reason: "no_name" };
  return name === undefined
    ? { ok: true, deviceId: payload.deviceId }
    : { ok: true, name, deviceId: payload.deviceId };
}

/**
 * The trip as friend-facing code may see it: no PIN, no organiser token, no
 * PIN-try state. Friend pages can't leak these secrets because they never get them.
 */
export type ParticipantTrip = Omit<Trip, "pin" | "organiserToken" | "failedPinTries" | "pinPausedUntil">;

function participantView(trip: Trip): ParticipantTrip {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { pin, organiserToken, failedPinTries, pinPausedUntil, ...rest } = trip;
  return rest;
}

export type ParticipantAccess =
  | { ok: true; trip: ParticipantTrip; payload: JoinPayload; name?: string; deviceId: string }
  | { ok: false; reason: GuardFailure };

/** Every participant page and action starts here (A1). */
export async function requireParticipant(
  tripId: string,
  opts: { needName: boolean },
): Promise<ParticipantAccess> {
  const store = await cookies();
  const payload = verifyPayload(store.get(cookieName(tripId))?.value);
  const trip = await getTrip(tripId);
  const decision = guardDecision(payload, trip, opts);
  if (!decision.ok) return decision;
  return { ...decision, trip: participantView(trip!), payload: payload! };
}

export type OrganiserAccess =
  | { ok: true; trip: Trip }
  | { ok: false; reason: "no_trip" | "bad_token" };

/** Every organiser page and action starts here (A1). The token comes from the organiser link. */
export async function requireOrganiser(tripId: string, token: unknown): Promise<OrganiserAccess> {
  const trip = await getTrip(tripId);
  if (!trip) return { ok: false, reason: "no_trip" };
  // The token comes from the URL, so it can be missing or an array at runtime.
  if (typeof token !== "string" || !safeEqual(token, trip.organiserToken)) {
    return { ok: false, reason: "bad_token" };
  }
  return { ok: true, trip };
}

// ---------------------------------------------------------------------------
// Cookie writes (only valid inside a Server Action or Route Handler).
// ---------------------------------------------------------------------------

export async function setJoinCookie(payload: JoinPayload): Promise<void> {
  const store = await cookies();
  store.set(cookieName(payload.tripId), signPayload(payload), cookieOptions);
}

/**
 * "Not you? Switch": drop the name, keep the PIN, and issue a NEW device ID, so
 * on a shared phone the wrong-name guard fires for the other friend.
 */
export function switchedPayload(payload: JoinPayload): JoinPayload {
  return { tripId: payload.tripId, pinVersion: payload.pinVersion, deviceId: newDeviceId() };
}

export async function clearName(payload: JoinPayload): Promise<JoinPayload> {
  const next = switchedPayload(payload);
  await setJoinCookie(next);
  return next;
}
