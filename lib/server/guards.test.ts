// Tests added by the /review checkpoint 1+2 fixes: access guards, fail-closed
// rules, keep-alive hardening, and the SQL ↔ TypeScript dealbreaker tag list.
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/data")>()),
  getDb: vi.fn(),
  getTrip: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));

import { cookies } from "next/headers";
import { GET as keepalive } from "@/app/api/keepalive/route";
import { DEALBREAKER_TAGS, computeResults, type ScoringInput } from "@/lib/scoring";
import {
  cookieName,
  requireOrganiser,
  requireParticipant,
  signPayload,
  verifyPayload,
} from "@/lib/server/access";
import { canSave, getDb, getTrip, toDeadlineIso, type Trip } from "@/lib/server/data";

const SESSION_SECRET = "test-secret-that-is-at-least-32-characters-long";

function trip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: "trip_abc",
    name: "Goa or bust",
    participantNames: ["Asha", "Bilal", "Chirag"],
    windows: [{ id: "w1", label: "12–16 Dec", start: "2026-12-12", end: "2026-12-16" }],
    deadline: toDeadlineIso("2026-09-30", "23:59"),
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

afterEach(() => {
  vi.unstubAllEnvs();
  vi.mocked(getTrip).mockReset();
  vi.mocked(getDb).mockReset();
  vi.mocked(cookies).mockReset();
});

describe("requireOrganiser", () => {
  it("refuses a wrong, empty, prefix, missing or non-string token", async () => {
    vi.mocked(getTrip).mockResolvedValue(trip());
    for (const token of ["wrong", "", "organiser", undefined, ["organiser-token"], 42]) {
      expect(await requireOrganiser("trip_abc", token)).toEqual({ ok: false, reason: "bad_token" });
    }
  });

  it("refuses when the trip doesn't exist", async () => {
    vi.mocked(getTrip).mockResolvedValue(null);
    expect(await requireOrganiser("nope", "organiser-token")).toEqual({ ok: false, reason: "no_trip" });
  });

  it("allows the real token", async () => {
    vi.mocked(getTrip).mockResolvedValue(trip());
    expect(await requireOrganiser("trip_abc", "organiser-token")).toMatchObject({ ok: true });
  });
});

describe("requireParticipant wiring", () => {
  function withCookie(value: string | undefined) {
    vi.mocked(cookies).mockResolvedValue({
      get: (name: string) => (name === cookieName("trip_abc") && value ? { name, value } : undefined),
    } as unknown as Awaited<ReturnType<typeof cookies>>);
  }

  it("no cookie → no_cookie", async () => {
    vi.stubEnv("SESSION_SECRET", SESSION_SECRET);
    vi.mocked(getTrip).mockResolvedValue(trip());
    withCookie(undefined);
    expect(await requireParticipant("trip_abc", { needName: false })).toEqual({ ok: false, reason: "no_cookie" });
  });

  it("a cookie signed for another trip → no_cookie", async () => {
    vi.stubEnv("SESSION_SECRET", SESSION_SECRET);
    vi.mocked(getTrip).mockResolvedValue(trip());
    withCookie(signPayload({ tripId: "other_trip", pinVersion: 1, deviceId: "d1" }));
    expect(await requireParticipant("trip_abc", { needName: false })).toEqual({ ok: false, reason: "no_cookie" });
  });

  it("a valid cookie with a name → ok, with the trip attached", async () => {
    vi.stubEnv("SESSION_SECRET", SESSION_SECRET);
    vi.mocked(getTrip).mockResolvedValue(trip());
    withCookie(signPayload({ tripId: "trip_abc", pinVersion: 1, name: "Asha", deviceId: "d1" }));
    const access = await requireParticipant("trip_abc", { needName: true });
    expect(access).toMatchObject({ ok: true, name: "Asha", deviceId: "d1" });
    expect(access.ok && access.trip.id).toBe("trip_abc");
  });
});

describe("verifyPayload", () => {
  it("rejects a validly signed body that isn't JSON (no crash)", () => {
    vi.stubEnv("SESSION_SECRET", SESSION_SECRET);
    const body = Buffer.from("not json").toString("base64url");
    const sig = createHmac("sha256", SESSION_SECRET).update(body).digest("base64url");
    expect(verifyPayload(`${body}.${sig}`)).toBeNull();
  });
});

describe("canSave fails closed", () => {
  it("refuses when the stored deadline can't be parsed", () => {
    expect(canSave(trip({ deadline: "not-a-date" }), new Date("2026-09-28T12:00:00+05:30"))).toEqual({
      ok: false,
      reason: "deadline",
    });
  });
});

describe("keep-alive hardening", () => {
  const req = (auth: string) => new Request("http://localhost/api/keepalive", { headers: { authorization: auth } });

  it("treats a short or placeholder CRON_SECRET as unset", async () => {
    vi.stubEnv("CRON_SECRET", "replace-me");
    expect((await keepalive(req("Bearer replace-me"))).status).toBe(401);
  });

  it("returns 500 without details when the database isn't configured", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret-for-tests");
    vi.mocked(getDb).mockImplementation(() => {
      throw new Error("Database not configured: set SUPABASE_URL");
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await keepalive(req("Bearer cron-secret-for-tests"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false });
    spy.mockRestore();
  });
});

describe("migration ↔ code: dealbreaker tags", () => {
  it("both CHECK constraints list exactly DEALBREAKER_TAGS", () => {
    const sql = readFileSync("supabase/migrations/001_init.sql", "utf8");
    const lists = [...sql.matchAll(/<@ array\[([^\]]*)\]::text\[\]/g)].map((m) =>
      [...m[1].matchAll(/'([^']+)'/g)].map((t) => t[1]).sort(),
    );
    expect(lists).toHaveLength(2);
    for (const list of lists) expect(list).toEqual([...DEALBREAKER_TAGS].sort());
  });
});

describe("scoring ignores bad stored data", () => {
  const base: ScoringInput = {
    participants: ["Asha", "Bilal"],
    responses: [
      { name: "Asha", budgetInr: 20000, availableWindowIds: ["w1", "bad"], dealbreakers: [], tripType: "beach" },
      { name: "Bilal", budgetInr: 20000, availableWindowIds: ["w1", "bad"], dealbreakers: [], tripType: "beach" },
    ],
    destinations: [
      { id: "goa", name: "Goa", costPerPersonInr: 10000, bestMonths: [12], tripType: "beach", attributes: [] },
    ],
    windows: [{ id: "w1", label: "12–16 Dec", start: "2026-12-12", end: "2026-12-16" }],
  };

  it.each([
    ["reversed", { start: "2026-12-16", end: "2026-12-12" }],
    ["not a real date", { start: "2026-02-31", end: "2026-03-02" }],
    ["garbage", { start: "soon", end: "later" }],
    ["absurdly long", { start: "1000-01-01", end: "9999-12-31" }],
  ])("a %s window is never scored (no NaN, no slow loop)", (_, dates) => {
    const out = computeResults({ ...base, windows: [...base.windows, { id: "bad", label: "bad", ...dates }] });
    expect(out.shown.map((o) => o.windowId)).toEqual(["w1"]);
    for (const o of out.shown) expect(o.groupAverage).not.toContain("NaN");
  });

  it("a response from a name outside the participant list doesn't count", () => {
    const stray = { name: "Mallory", budgetInr: 5000, availableWindowIds: [], dealbreakers: [], tripType: "city" as const };
    const out = computeResults({ ...base, responses: [...base.responses, stray] });
    expect(out.label).toBe("Based on 2 of 2.");
    expect(out.submittedCount).toBe(2);
    expect(out.shown[0].passes).toBe(true);
  });
});
