import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Only getDb is replaced (for the keep-alive route); every rule below is the real code.
vi.mock("@/lib/server/data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/data")>()),
  getDb: vi.fn(),
}));

import { GET as keepalive } from "@/app/api/keepalive/route";
import {
  cookieName,
  cookieOptions,
  guardDecision,
  newDeviceId,
  newOrganiserToken,
  newPin,
  newTripId,
  pinAttempt,
  safeEqual,
  signPayload,
  switchedPayload,
  verifyPayload,
  type JoinPayload,
} from "@/lib/server/access";
import {
  canSave,
  formatDeadlineIst,
  getDb,
  resultsLabel,
  toDeadlineIso,
  type Trip,
} from "@/lib/server/data";

const DEADLINE = toDeadlineIso("2026-09-30", "23:59");
const BEFORE = new Date("2026-09-28T12:00:00+05:30");
const AFTER = new Date("2026-10-01T00:00:00+05:30");

function trip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: "trip_abc",
    name: "Goa?",
    participantNames: ["Asha", "Bilal", "Chirag", "Dev", "Esha"],
    windows: [{ id: "w1", label: "12-16 Dec", start: "2026-12-12", end: "2026-12-16" }],
    deadline: DEADLINE,
    pin: "042917",
    pinVersion: 1,
    organiserToken: "organiser-token",
    lockedEarly: false,
    finalDestinationId: null,
    finalWindowId: null,
    failedPinTries: 0,
    pinPausedUntil: null,
    createdAt: "2026-09-25T10:00:00+05:30",
    ...overrides,
  };
}

const PROVISIONAL = "Provisional: can change until Wed 30 Sep, 11:59 PM IST";
const LOCKED = "Results (locked)";

describe("deadline (SO-2)", () => {
  it("stores the form's date + time as :59 seconds in IST", () => {
    expect(toDeadlineIso("2026-09-30", "23:59")).toBe("2026-09-30T23:59:59+05:30");
    expect(toDeadlineIso("2026-01-05", "09:05")).toBe("2026-01-05T09:05:59+05:30");
  });

  it("rejects malformed or impossible input", () => {
    expect(() => toDeadlineIso("30-09-2026", "23:59")).toThrow();
    expect(() => toDeadlineIso("2026-02-31", "23:59")).toThrow();
    expect(() => toDeadlineIso("2026-09-30", "24:00")).toThrow();
    expect(() => toDeadlineIso("2026-09-30", "9:05")).toThrow();
  });

  it("accepts a save at 23:59:30 IST and refuses one at 00:00:00 IST the next day", () => {
    const t = trip();
    expect(canSave(t, new Date("2026-09-30T23:59:30+05:30"))).toEqual({ ok: true });
    expect(canSave(t, new Date("2026-09-30T23:59:59+05:30"))).toEqual({ ok: true });
    expect(canSave(t, new Date("2026-10-01T00:00:00+05:30"))).toEqual({
      ok: false,
      reason: "deadline",
    });
  });

  it("works the same with the UTC form Postgres returns", () => {
    const t = trip({ deadline: "2026-09-30T18:29:59+00:00" });
    expect(canSave(t, new Date("2026-09-30T23:59:30+05:30")).ok).toBe(true);
    expect(canSave(t, AFTER).ok).toBe(false);
    expect(formatDeadlineIst(t.deadline)).toBe("Wed 30 Sep, 11:59 PM IST");
  });
});

describe("canSave / resultsLabel (R-1, R-3)", () => {
  it("open", () => {
    const t = trip();
    expect(canSave(t, BEFORE)).toEqual({ ok: true });
    expect(resultsLabel(t, BEFORE)).toBe(PROVISIONAL);
  });

  it("locked early", () => {
    const t = trip({ lockedEarly: true });
    expect(canSave(t, BEFORE)).toEqual({ ok: false, reason: "locked" });
    expect(resultsLabel(t, BEFORE)).toBe(LOCKED);
  });

  it("unlocked again → open", () => {
    const t = trip({ lockedEarly: false });
    expect(resultsLabel(t, BEFORE)).toBe(PROVISIONAL);
  });

  it("final set", () => {
    const t = trip({ finalDestinationId: "goa", finalWindowId: "w1" });
    expect(canSave(t, BEFORE)).toEqual({ ok: false, reason: "final" });
    expect(resultsLabel(t, BEFORE)).toBe(LOCKED);
  });

  it("final cleared while not locked early → open again", () => {
    const set = trip({ finalDestinationId: "goa", finalWindowId: "w1" });
    const cleared = { ...set, finalDestinationId: null, finalWindowId: null };
    expect(canSave(cleared, BEFORE)).toEqual({ ok: true });
    expect(resultsLabel(cleared, BEFORE)).toBe(PROVISIONAL);
  });

  it("locked early + final set + final cleared → still locked", () => {
    const set = trip({ lockedEarly: true, finalDestinationId: "goa", finalWindowId: "w1" });
    expect(canSave(set, BEFORE).ok).toBe(false);
    const cleared = { ...set, finalDestinationId: null, finalWindowId: null };
    expect(canSave(cleared, BEFORE)).toEqual({ ok: false, reason: "locked" });
    expect(resultsLabel(cleared, BEFORE)).toBe(LOCKED);
  });

  it("deadline passed (and clearing final or unlocking doesn't reopen it)", () => {
    expect(canSave(trip(), AFTER)).toEqual({ ok: false, reason: "deadline" });
    expect(resultsLabel(trip(), AFTER)).toBe(LOCKED);
    const everything = trip({ lockedEarly: true, finalDestinationId: "goa", finalWindowId: "w1" });
    expect(canSave(everything, AFTER)).toEqual({ ok: false, reason: "deadline" });
  });
});

describe("formatDeadlineIst", () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it("formats in IST regardless of the machine timezone", () => {
    for (const tz of ["UTC", "America/Los_Angeles", "Pacific/Kiritimati", "Asia/Kolkata"]) {
      process.env.TZ = tz;
      expect(formatDeadlineIst(DEADLINE)).toBe("Wed 30 Sep, 11:59 PM IST");
      expect(formatDeadlineIst(new Date("2026-12-12T00:05:00+05:30"))).toBe(
        "Sat 12 Dec, 12:05 AM IST",
      );
      expect(formatDeadlineIst("2026-10-02T06:30:00Z")).toBe("Fri 2 Oct, 12:00 PM IST");
      expect(formatDeadlineIst("2026-10-02T15:12:00Z")).toBe("Fri 2 Oct, 8:42 PM IST");
    }
  });
});

describe("pinAttempt", () => {
  const now = new Date("2026-09-26T10:00:00+05:30");

  it("wrong tries 1-9 → wrong, with tries left", () => {
    for (let before = 0; before < 9; before++) {
      const a = pinAttempt(trip({ failedPinTries: before }), now, false);
      expect(a).toEqual({ outcome: "wrong", triesLeft: 10 - (before + 1), action: "register_failure" });
    }
  });

  it("the 10th wrong try → paused for 15 minutes", () => {
    const a = pinAttempt(trip({ failedPinTries: 9 }), now, false);
    expect(a).toEqual({ outcome: "paused", minutesLeft: 15, action: "register_failure" });
  });

  it("while paused, even a correct PIN is refused and nothing is written", () => {
    const paused = trip({ pinPausedUntil: new Date(now.getTime() + 14 * 60_000 + 1).toISOString() });
    expect(pinAttempt(paused, now, true)).toEqual({ outcome: "paused", minutesLeft: 15, action: "none" });
    expect(pinAttempt(paused, now, false)).toEqual({ outcome: "paused", minutesLeft: 15, action: "none" });
    const later = new Date(now.getTime() + 10 * 60_000);
    expect(pinAttempt(paused, later, true)).toMatchObject({ outcome: "paused", minutesLeft: 5 });
  });

  it("after the pause ends, a correct PIN → ok and the counter is reset", () => {
    const paused = trip({ pinPausedUntil: new Date(now.getTime() + 15 * 60_000).toISOString() });
    const afterPause = new Date(now.getTime() + 15 * 60_000);
    expect(pinAttempt(paused, afterPause, true)).toEqual({ outcome: "ok", action: "reset" });
  });

  it("a correct PIN with some wrong tries → ok and reset", () => {
    expect(pinAttempt(trip({ failedPinTries: 4 }), now, true)).toEqual({ outcome: "ok", action: "reset" });
  });
});

describe("signed cookie", () => {
  const SECRET = "test-secret-that-is-at-least-32-characters-long";
  const payload: JoinPayload = { tripId: "trip_abc", pinVersion: 2, name: "Asha", deviceId: "dev1" };

  beforeEach(() => vi.stubEnv("SESSION_SECRET", SECRET));
  afterEach(() => vi.unstubAllEnvs());

  it("round-trips", () => {
    const token = signPayload(payload);
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(verifyPayload(token)).toEqual(payload);
    const noName: JoinPayload = { tripId: "t", pinVersion: 1, deviceId: "d" };
    expect(verifyPayload(signPayload(noName))).toEqual(noName);
  });

  it("rejects a tampered payload", () => {
    const [, sig] = signPayload(payload).split(".");
    const forged = Buffer.from(JSON.stringify({ ...payload, name: "Bilal" })).toString("base64url");
    expect(verifyPayload(`${forged}.${sig}`)).toBeNull();
  });

  it("rejects a tampered signature", () => {
    const [body, sig] = signPayload(payload).split(".");
    const flipped = (sig[0] === "A" ? "B" : "A") + sig.slice(1);
    expect(verifyPayload(`${body}.${flipped}`)).toBeNull();
    expect(verifyPayload(`${body}.`)).toBeNull();
    expect(verifyPayload(body)).toBeNull();
    expect(verifyPayload(`${body}.${sig}.x`)).toBeNull();
    expect(verifyPayload("")).toBeNull();
    expect(verifyPayload(undefined)).toBeNull();
  });

  it("rejects a cookie signed with a different secret", () => {
    const token = signPayload(payload);
    vi.stubEnv("SESSION_SECRET", "another-secret-that-is-also-32-characters!!");
    expect(verifyPayload(token)).toBeNull();
  });

  it("rejects a validly signed body with the wrong shape", () => {
    const signed = (value: unknown) => {
      const body = Buffer.from(JSON.stringify(value)).toString("base64url");
      return `${body}.${createHmac("sha256", SECRET).update(body).digest("base64url")}`;
    };
    // Sanity check: the hand-signed format is accepted when the shape is right.
    expect(verifyPayload(signed({ tripId: "t", pinVersion: 1, deviceId: "d" }))).not.toBeNull();
    expect(verifyPayload(signed({ tripId: "t", pinVersion: "1", deviceId: "d" }))).toBeNull();
    expect(verifyPayload(signed({ tripId: "t", pinVersion: 1 }))).toBeNull();
    expect(verifyPayload(signed({ tripId: "t", pinVersion: 1, deviceId: "d", name: 5 }))).toBeNull();
    expect(verifyPayload(signed(null))).toBeNull();
  });

  it("refuses to work with a missing or short SESSION_SECRET", () => {
    vi.stubEnv("SESSION_SECRET", "too-short");
    expect(() => signPayload(payload)).toThrow(/SESSION_SECRET/);
    vi.stubEnv("SESSION_SECRET", "");
    expect(() => verifyPayload("a.b")).toThrow(/SESSION_SECRET/);
  });

  it("uses one cookie per trip with the agreed options", () => {
    expect(cookieName("trip_abc")).toBe("dch_trip_abc");
    expect(cookieOptions).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 24 * 60 * 60,
    });
  });

  it("Switch drops the name, keeps the PIN version, and issues a new device ID", () => {
    const next = switchedPayload(payload);
    expect(next.tripId).toBe(payload.tripId);
    expect(next.pinVersion).toBe(payload.pinVersion);
    expect(next.name).toBeUndefined();
    expect(next.deviceId).not.toBe(payload.deviceId);
  });
});

describe("guardDecision", () => {
  const t = trip({ pinVersion: 3 });
  const cookie: JoinPayload = { tripId: t.id, pinVersion: 3, name: "Bilal", deviceId: "dev1" };

  it("no trip", () => {
    expect(guardDecision(cookie, null, { needName: false })).toEqual({ ok: false, reason: "no_trip" });
  });

  it("no cookie (or a cookie for another trip)", () => {
    expect(guardDecision(null, t, { needName: false })).toEqual({ ok: false, reason: "no_cookie" });
    expect(guardDecision({ ...cookie, tripId: "other" }, t, { needName: false })).toEqual({
      ok: false,
      reason: "no_cookie",
    });
  });

  it("cookie issued under an old PIN → pin_changed", () => {
    expect(guardDecision({ ...cookie, pinVersion: 2 }, t, { needName: false })).toEqual({
      ok: false,
      reason: "pin_changed",
    });
  });

  it("name missing or not in the participant list → no_name when a name is needed", () => {
    const { name: _drop, ...noName } = cookie;
    void _drop;
    expect(guardDecision(noName, t, { needName: true })).toEqual({ ok: false, reason: "no_name" });
    expect(guardDecision({ ...cookie, name: "Mallory" }, t, { needName: true })).toEqual({
      ok: false,
      reason: "no_name",
    });
    // Without needName, an unknown name is simply dropped.
    expect(guardDecision({ ...cookie, name: "Mallory" }, t, { needName: false })).toEqual({
      ok: true,
      deviceId: "dev1",
    });
  });

  it("ok", () => {
    expect(guardDecision(cookie, t, { needName: true })).toEqual({
      ok: true,
      name: "Bilal",
      deviceId: "dev1",
    });
  });
});

describe("random IDs and PIN", () => {
  it("newPin is always exactly 6 digits", () => {
    for (let i = 0; i < 2000; i++) expect(newPin()).toMatch(/^\d{6}$/);
  });

  it("IDs are URL-safe, long and unique", () => {
    const urlSafe = /^[A-Za-z0-9_-]+$/;
    const tripId = newTripId();
    const token = newOrganiserToken();
    const device = newDeviceId();
    expect(tripId).toMatch(urlSafe);
    expect(token).toMatch(urlSafe);
    expect(device).toMatch(urlSafe);
    expect(tripId.length).toBeGreaterThanOrEqual(22); // ≥ 16 bytes
    expect(token.length).toBe(43); // 32 bytes
    expect(encodeURIComponent(tripId)).toBe(tripId);
    expect(new Set(Array.from({ length: 200 }, newTripId)).size).toBe(200);
  });

  it("safeEqual compares tokens exactly", () => {
    expect(safeEqual("organiser-token", "organiser-token")).toBe(true);
    expect(safeEqual("organiser-token", "organiser-tokeN")).toBe(false);
    expect(safeEqual("organiser-token", "organiser")).toBe(false);
    expect(safeEqual("", "x")).toBe(false);
  });
});

describe("keep-alive route (R1)", () => {
  const SECRET = "cron-secret-for-tests";
  const req = (auth?: string) =>
    new Request("http://localhost/api/keepalive", auth ? { headers: { authorization: auth } } : {});
  const mockDb = (error: { message: string } | null) =>
    vi.mocked(getDb).mockReturnValue({
      from: () => ({ select: () => ({ limit: async () => ({ data: [], error }) }) }),
    } as unknown as ReturnType<typeof getDb>);

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.mocked(getDb).mockReset();
  });

  it("401 when CRON_SECRET is not set, even with a matching-looking header", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await keepalive(req("Bearer "))).status).toBe(401);
    expect((await keepalive(req("Bearer undefined"))).status).toBe(401);
    expect(getDb).not.toHaveBeenCalled();
  });

  it("401 without the header or with the wrong secret", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    expect((await keepalive(req())).status).toBe(401);
    expect((await keepalive(req(`Bearer wrong`))).status).toBe(401);
    expect((await keepalive(req(SECRET))).status).toBe(401);
    expect(getDb).not.toHaveBeenCalled();
  });

  it("200 { ok: true } with the right secret and a working database", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    mockDb(null);
    const res = await keepalive(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("500 { ok: false } on a database error, without leaking details", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    mockDb({ message: "connection refused to db.internal:5432" });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await keepalive(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(500);
    expect(await res.text()).toBe(JSON.stringify({ ok: false }));
    spy.mockRestore();
  });
});
