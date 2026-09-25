import "server-only";

import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getTrip, registerPinFailure, resetPinTries, type PinFailureState, type Trip } from "./data";

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

export function signPayload(payload: JoinPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

/** Returns the payload only if the signature is valid and the shape is right; otherwise null. */
export function verifyPayload(token: string | null | undefined): JoinPayload | null {
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
      (p.name !== undefined && typeof p.name !== "string")
    ) {
      return null;
    }
    return { tripId: p.tripId, pinVersion: p.pinVersion, name: p.name, deviceId: p.deviceId };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// PIN try limit (pure; `now` is passed in). The DB does the counting atomically.
// ---------------------------------------------------------------------------

export const MAX_PIN_TRIES = 10;
export const PIN_PAUSE_MINUTES = 15;

export type PinOutcome =
  | { outcome: "ok" }
  | { outcome: "wrong"; triesLeft: number }
  | { outcome: "paused"; minutesLeft: number };

/** What the database should do after this attempt. */
export type PinAction = "reset" | "register_failure" | "none";

type PinFields = Pick<Trip, "failedPinTries" | "pinPausedUntil">;

function pausedMinutesLeft(pinPausedUntil: string | null, now: Date): number {
  if (!pinPausedUntil) return 0;
  const ms = new Date(pinPausedUntil).getTime() - now.getTime();
  return ms > 0 ? Math.ceil(ms / 60_000) : 0;
}

/** The outcome the user sees, given the counter state after a failure was registered. */
export function failureOutcome(state: PinFailureState, now: Date): PinOutcome {
  const minutesLeft = pausedMinutesLeft(state.pinPausedUntil, now);
  if (minutesLeft > 0) return { outcome: "paused", minutesLeft };
  return { outcome: "wrong", triesLeft: MAX_PIN_TRIES - state.failedPinTries };
}

/**
 * Decide a PIN attempt. While paused, even a correct PIN is refused.
 * For a wrong PIN the outcome is the expected one; the caller should prefer
 * the state the database returns (see checkPin).
 */
export function pinAttempt(
  trip: PinFields,
  now: Date,
  correct: boolean,
): PinOutcome & { action: PinAction } {
  const minutesLeft = pausedMinutesLeft(trip.pinPausedUntil, now);
  if (minutesLeft > 0) return { outcome: "paused", minutesLeft, action: "none" };
  if (correct) return { outcome: "ok", action: "reset" };

  const tries = trip.failedPinTries + 1;
  const expected: PinFailureState =
    tries >= MAX_PIN_TRIES
      ? {
          failedPinTries: 0,
          pinPausedUntil: new Date(now.getTime() + PIN_PAUSE_MINUTES * 60_000).toISOString(),
        }
      : { failedPinTries: tries, pinPausedUntil: trip.pinPausedUntil };
  return { ...failureOutcome(expected, now), action: "register_failure" };
}

/** Check an entered PIN against the trip and record the result in the database. */
export async function checkPin(trip: Trip, enteredPin: string, now: Date): Promise<PinOutcome> {
  const attempt = pinAttempt(trip, now, safeEqual(enteredPin, trip.pin));
  if (attempt.action === "reset") {
    await resetPinTries(trip.id);
    return { outcome: "ok" };
  }
  if (attempt.action === "register_failure") {
    return failureOutcome(await registerPinFailure(trip.id, now), now);
  }
  return { outcome: "paused", minutesLeft: pausedMinutesLeft(trip.pinPausedUntil, now) };
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

export type ParticipantAccess =
  | { ok: true; trip: Trip; payload: JoinPayload; name?: string; deviceId: string }
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
  return { ...decision, trip: trip!, payload: payload! };
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
