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
  safeEqual,
  signPayload,
  switchedPayload,
  verifyPayload,
  type JoinPayload,
} from "@/lib/server/access";
import {
  canSave,
  formatDeadlineIst,
  formatTimeIst,
  getDb,
  isCalendarDate,
  parseCreateTripInput,
  parseParticipantName,
  parsePin,
  parseResponseInput,
  pinOutcomeMessage,
  resultsLabel,
  savedAtText,
  toDeadlineIso,
  windowLabel,
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
    // Sanity check: the hand-signed format is accepted when the shape is right
    // (including `iat`, the issue time the server checks for the 60-day expiry).
    const iat = Math.floor(Date.now() / 1000);
    expect(verifyPayload(signed({ tripId: "t", pinVersion: 1, deviceId: "d", iat }))).not.toBeNull();
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

// ---------------------------------------------------------------------------
// Input validation (Q1): the pure helpers behind app/actions.ts.
// ---------------------------------------------------------------------------

describe("windowLabel / formatTimeIst / savedAtText", () => {
  it("labels windows readably", () => {
    expect(windowLabel("2026-12-12", "2026-12-16")).toBe("12–16 Dec");
    expect(windowLabel("2026-12-30", "2027-01-03")).toBe("30 Dec – 3 Jan");
    expect(windowLabel("2026-11-28", "2026-12-02")).toBe("28 Nov – 2 Dec");
    expect(windowLabel("2026-12-12", "2026-12-12")).toBe("12 Dec");
    // Same month, different year: not "12–16 Dec".
    expect(windowLabel("2026-12-12", "2027-12-16")).toBe("12 Dec – 16 Dec");
  });

  it("formats the time in IST regardless of the machine timezone", () => {
    expect(formatTimeIst(new Date("2026-09-25T21:42:10+05:30"))).toBe("9:42 PM");
    expect(formatTimeIst(new Date("2026-09-25T16:12:00Z"))).toBe("9:42 PM");
    expect(formatTimeIst(new Date("2026-09-25T00:05:00+05:30"))).toBe("12:05 AM");
    expect(formatTimeIst(new Date("2026-09-25T12:00:00+05:30"))).toBe("12:00 PM");
    expect(formatTimeIst(new Date("2026-09-25T09:07:00+05:30"))).toBe("9:07 AM");
  });

  it("builds the save confirmation", () => {
    expect(savedAtText(new Date("2026-09-25T21:42:00+05:30"), DEADLINE)).toBe(
      "Saved at 9:42 PM. You can edit until Wed 30 Sep, 11:59 PM IST",
    );
  });

  it("isCalendarDate accepts real YYYY-MM-DD dates only", () => {
    expect(isCalendarDate("2028-02-29")).toBe(true);
    expect(isCalendarDate("2026-02-29")).toBe(false);
    expect(isCalendarDate("2026-02-31")).toBe(false);
    expect(isCalendarDate("2026-13-01")).toBe(false);
    expect(isCalendarDate("2026-1-05")).toBe(false);
    expect(isCalendarDate(20261205)).toBe(false);
  });
});

describe("PIN and name input", () => {
  it("parsePin: exactly 6 digits, leading zeros kept, spaces around ignored", () => {
    expect(parsePin("042917")).toEqual({ ok: true, value: "042917" });
    expect(parsePin(" 042917 ")).toEqual({ ok: true, value: "042917" });
    for (const bad of ["42917", "0429170", "04291a", "04 2917", "", 42917, null, undefined, ["042917"]]) {
      expect(parsePin(bad)).toEqual({ ok: false, message: "Enter the 6-digit PIN." });
    }
  });

  it("pinOutcomeMessage: plain words, singular when it's 1", () => {
    expect(pinOutcomeMessage({ outcome: "wrong", triesLeft: 3 })).toBe(
      "That PIN isn't right. 3 tries left.",
    );
    expect(pinOutcomeMessage({ outcome: "wrong", triesLeft: 1 })).toBe(
      "That PIN isn't right. 1 try left.",
    );
    expect(pinOutcomeMessage({ outcome: "paused", minutesLeft: 15 })).toBe(
      "Too many wrong tries. Try again in 15 minutes.",
    );
    expect(pinOutcomeMessage({ outcome: "paused", minutesLeft: 1 })).toBe(
      "Too many wrong tries. Try again in 1 minute.",
    );
  });

  it("parseParticipantName: only an exact name from the trip", () => {
    const names = ["Asha", "Bilal"];
    expect(parseParticipantName("Bilal", names)).toEqual({ ok: true, value: "Bilal" });
    for (const bad of ["bilal", " Bilal", "Karan", "", 1, undefined]) {
      expect(parseParticipantName(bad, names).ok).toBe(false);
    }
  });
});

describe("parseCreateTripInput", () => {
  const NOW = new Date("2026-09-25T12:00:00+05:30");
  const valid = () => ({
    tripName: "  Goa?  ",
    participantNames: [" Asha ", "Bilal", "Chirag"],
    windows: [
      { start: "2026-12-12", end: "2026-12-16" },
      { start: "2026-12-30", end: "2027-01-03" },
      { start: "2027-01-10", end: "2027-01-10" },
    ],
    deadlineDate: "2026-09-30",
    deadlineTime: "21:00",
  });
  const message = (overrides: Record<string, unknown>) => {
    const r = parseCreateTripInput({ ...valid(), ...overrides }, NOW);
    return r.ok ? null : r.message;
  };

  it("accepts a valid trip: trimmed, window ids w1.., labels, IST deadline", () => {
    expect(parseCreateTripInput(valid(), NOW)).toEqual({
      ok: true,
      value: {
        name: "Goa?",
        participantNames: ["Asha", "Bilal", "Chirag"],
        windows: [
          { id: "w1", label: "12–16 Dec", start: "2026-12-12", end: "2026-12-16" },
          { id: "w2", label: "30 Dec – 3 Jan", start: "2026-12-30", end: "2027-01-03" },
          { id: "w3", label: "10 Jan", start: "2027-01-10", end: "2027-01-10" },
        ],
        deadline: "2026-09-30T21:00:59+05:30",
      },
    });
  });

  it("defaults the deadline time to 23:59", () => {
    for (const deadlineTime of [undefined, ""]) {
      const r = parseCreateTripInput({ ...valid(), deadlineTime }, NOW);
      expect(r.ok && r.value.deadline).toBe("2026-09-30T23:59:59+05:30");
    }
  });

  it("rejects input that isn't an object", () => {
    for (const input of [null, undefined, "trip", 1, []]) {
      expect(parseCreateTripInput(input, NOW).ok).toBe(false);
    }
  });

  it("trip name: 1-60 characters after trimming", () => {
    expect(message({ tripName: "   " })).toBe("Give the trip a name.");
    expect(message({ tripName: 5 })).toBe("Give the trip a name.");
    expect(message({ tripName: "x".repeat(60) })).toBeNull();
    expect(message({ tripName: "x".repeat(61) })).toBe(
      "Keep the trip name to 60 characters or fewer.",
    );
  });

  it("people: 2-10", () => {
    expect(message({ participantNames: ["Asha"] })).toBe("Add at least 2 people.");
    expect(message({ participantNames: "Asha, Bilal" })).toBe("Add at least 2 people.");
    expect(message({ participantNames: ["Asha", "Bilal"] })).toBeNull();
    const ten = Array.from({ length: 10 }, (_, i) => `P${i}`);
    expect(message({ participantNames: ten })).toBeNull();
    expect(message({ participantNames: [...ten, "P10"] })).toBe("You can add up to 10 people.");
  });

  it("names: non-empty, at most 30 characters, unique ignoring case", () => {
    expect(message({ participantNames: ["Asha", "  "] })).toBe("Names can't be blank.");
    expect(message({ participantNames: ["Asha", 7] })).toBe("Names can't be blank.");
    expect(message({ participantNames: ["Asha", "x".repeat(30)] })).toBeNull();
    expect(message({ participantNames: ["Asha", "x".repeat(31)] })).toBe(
      "Keep each name to 30 characters or fewer.",
    );
    expect(message({ participantNames: ["Asha", "Bilal", " asha"] })).toBe(
      'Each name must be different. "asha" is there twice.',
    );
    // Look-alikes count as the same: extra inner spaces, zero-width characters, é vs e + ◌́.
    expect(message({ participantNames: ["Asha K", "Asha  K"] })).toBe(
      'Each name must be different. "Asha K" is there twice.',
    );
    expect(message({ participantNames: ["Asha", "As​ha"] })).toBe(
      'Each name must be different. "Asha" is there twice.',
    );
    expect(message({ participantNames: ["René", "René"] })).toBe(
      'Each name must be different. "René" is there twice.',
    );
  });

  it("windows: 3-4, real dates, start ≤ end", () => {
    const w = (start: string, end: string) => ({ start, end });
    const three = valid().windows;
    expect(message({ windows: three.slice(0, 2) })).toBe("Add 3 or 4 date options.");
    expect(message({ windows: [...three, w("2027-02-01", "2027-02-03")] })).toBeNull();
    expect(
      message({ windows: [...three, w("2027-02-01", "2027-02-03"), w("2027-03-01", "2027-03-03")] }),
    ).toBe("Add 3 or 4 date options.");
    expect(message({ windows: "w1" })).toBe("Add 3 or 4 date options.");
    expect(message({ windows: [three[0], three[1], { start: "2027-02-01" }] })).toBe(
      "Date option 3 needs a start and an end date.",
    );
    expect(message({ windows: [three[0], w("2026-02-27", "2026-02-31"), three[2]] })).toBe(
      "Date option 2 has a date that doesn't exist.",
    );
    expect(message({ windows: [w("2026-12-16", "2026-12-12"), three[1], three[2]] })).toBe(
      "In date option 1, the end date is before the start date.",
    );
    // Today is 25 Sep 2026 (IST): an option starting today is fine, yesterday is not.
    expect(message({ windows: [w("2026-09-25", "2026-09-27"), three[1], three[2]] })).toBeNull();
    expect(message({ windows: [w("2026-09-24", "2026-09-27"), three[1], three[2]] })).toBe(
      "Date option 1 starts in the past.",
    );
    expect(message({ windows: [three[0], three[1], three[0]] })).toBe(
      "Date option 3 is the same as another option.",
    );
  });

  it("deadline: a real date and time, in the future", () => {
    expect(message({ deadlineDate: "" })).toBe("Pick a deadline date.");
    expect(message({ deadlineDate: "2026-02-31" })).toBe("Pick a real deadline date and time.");
    expect(message({ deadlineTime: "24:00" })).toBe("Pick a real deadline date and time.");
    expect(message({ deadlineTime: 2359 })).toBe("Pick a real deadline date and time.");
    expect(message({ deadlineDate: "2026-09-24" })).toBe("The deadline must be in the future.");
    // Today at 11:59 AM IST has passed at noon; 12:00 PM today (…:59 seconds) is still ahead.
    expect(message({ deadlineDate: "2026-09-25", deadlineTime: "11:59" })).toBe(
      "The deadline must be in the future.",
    );
    expect(message({ deadlineDate: "2026-09-25", deadlineTime: "12:00" })).toBeNull();
  });
});

describe("parseResponseInput", () => {
  const WINDOW_IDS = ["w1", "w2", "w3"];
  const valid = () => ({
    budgetInr: 15000,
    availableWindowIds: ["w3", "w1"],
    dealbreakers: ["trekking"],
    tripType: "beach",
  });
  const parse = (overrides: Record<string, unknown>) =>
    parseResponseInput({ ...valid(), ...overrides }, WINDOW_IDS);

  it("accepts a valid response, de-duplicated and in the trip's order", () => {
    expect(
      parse({ availableWindowIds: ["w3", "w1", "w3"], dealbreakers: ["trekking", "international"] }),
    ).toEqual({
      ok: true,
      value: {
        budgetInr: 15000,
        availableWindowIds: ["w1", "w3"],
        dealbreakers: ["international", "trekking"],
        tripType: "beach",
      },
    });
  });

  it("never returns a name, even if the input carries one", () => {
    const r = parse({ name: "Bilal" });
    expect(r.ok && Object.keys(r.value).sort()).toEqual([
      "availableWindowIds",
      "budgetInr",
      "dealbreakers",
      "tripType",
    ]);
  });

  it("budget: a whole number from 1 to 10,00,000", () => {
    expect(parse({ budgetInr: 1 }).ok).toBe(true);
    expect(parse({ budgetInr: 1_000_000 }).ok).toBe(true);
    for (const budgetInr of [0, -5, 1_000_001, 12.5, "15000", NaN, Infinity, null, undefined]) {
      expect(parse({ budgetInr })).toEqual({
        ok: false,
        message: "Enter your budget in whole rupees, from 1 to 10,00,000.",
      });
    }
  });

  it("windows: a subset of the trip's windows; zero is allowed (Q5)", () => {
    const r = parse({ availableWindowIds: [] });
    expect(r.ok && r.value.availableWindowIds).toEqual([]);
    for (const availableWindowIds of [["w4"], ["w1", "W2"], [1], "w1", undefined]) {
      expect(parse({ availableWindowIds }).ok).toBe(false);
    }
  });

  it("dealbreakers: a subset of the known tags; none is fine", () => {
    expect(parse({ dealbreakers: [] }).ok).toBe(true);
    expect(parse({ dealbreakers: ["trekking", "long_flight"] })).toEqual({
      ok: false,
      message: "Some of the dealbreakers you ticked aren't on the list. Reload and try again.",
    });
    expect(parse({ dealbreakers: "trekking" }).ok).toBe(false);
  });

  it("trip type: one of the 5 values", () => {
    for (const tripType of ["beach", "hills", "city", "adventure", "none"]) {
      expect(parse({ tripType }).ok).toBe(true);
    }
    for (const tripType of ["Beach", "desert", "", null, undefined]) {
      expect(parse({ tripType }).ok).toBe(false);
    }
  });

  it("rejects input that isn't an object", () => {
    for (const input of [null, "x", 5, []]) {
      expect(parseResponseInput(input, WINDOW_IDS).ok).toBe(false);
    }
  });
});
