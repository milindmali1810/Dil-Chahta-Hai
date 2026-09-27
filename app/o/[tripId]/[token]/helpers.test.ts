import { describe, expect, it } from "vitest";
import {
  canLockNow,
  canUnlockNow,
  deadlinePassed,
  editingStatus,
  isJustRegenerated,
  markFinalQuestion,
  organiserPath,
  requestOrigin,
  tripLink,
} from "./helpers";

function headers(values: Record<string, string>) {
  return { get: (name: string) => values[name.toLowerCase()] ?? null };
}

describe("requestOrigin", () => {
  it("uses the proxy's forwarded host and proto", () => {
    expect(
      requestOrigin(headers({ host: "internal:3000", "x-forwarded-host": "dch.vercel.app", "x-forwarded-proto": "https" })),
    ).toBe("https://dch.vercel.app");
  });

  it("takes the first value of comma-separated forwarded headers", () => {
    expect(
      requestOrigin(headers({ "x-forwarded-host": "a.example, b.example", "x-forwarded-proto": "https, http" })),
    ).toBe("https://a.example");
  });

  it("falls back to Host, http for localhost and https otherwise", () => {
    expect(requestOrigin(headers({ host: "localhost:3000" }))).toBe("http://localhost:3000");
    expect(requestOrigin(headers({ host: "127.0.0.1:3000" }))).toBe("http://127.0.0.1:3000");
    expect(requestOrigin(headers({ host: "dch.example" }))).toBe("https://dch.example");
  });

  it("ignores a forwarded proto that isn't http or https", () => {
    expect(requestOrigin(headers({ host: "dch.example", "x-forwarded-proto": "javascript" }))).toBe(
      "https://dch.example",
    );
  });

  it("never returns an empty host", () => {
    expect(requestOrigin(headers({}))).toBe("http://localhost:3000");
  });
});

describe("links", () => {
  it("builds the trip link", () => {
    expect(tripLink("https://dch.example", "k3j9x2m8q7w4")).toBe("https://dch.example/t/k3j9x2m8q7w4");
  });

  it("builds the organiser path, with ?new=1 after Regenerate PIN", () => {
    expect(organiserPath("trip1", "tok_-9")).toBe("/o/trip1/tok_-9");
    expect(organiserPath("trip1", "tok_-9", true)).toBe("/o/trip1/tok_-9?new=1");
  });

  it("escapes anything that isn't URL-safe", () => {
    expect(organiserPath("a/b", "c?d")).toBe("/o/a%2Fb/c%3Fd");
  });

  it("reads ?new=1 only when it is exactly 1", () => {
    expect(isJustRegenerated("1")).toBe(true);
    expect(isJustRegenerated(undefined)).toBe(false);
    expect(isJustRegenerated("true")).toBe(false);
    expect(isJustRegenerated(["1", "1"])).toBe(false);
  });
});

describe("lock controls", () => {
  const deadline = "2026-09-30T23:59:59+05:30";
  const before = new Date("2026-09-30T23:59:30+05:30");
  const after = new Date("2026-10-01T00:00:00+05:30");

  it("treats the deadline second itself as not passed", () => {
    expect(deadlinePassed(deadline, new Date("2026-09-30T23:59:59+05:30"))).toBe(false);
    expect(deadlinePassed(deadline, after)).toBe(true);
  });

  it("treats an unparsable deadline as passed", () => {
    expect(deadlinePassed("not a date", before)).toBe(true);
  });

  it("offers Lock now only when open and before the deadline", () => {
    expect(canLockNow({ lockedEarly: false, deadline }, before)).toBe(true);
    expect(canLockNow({ lockedEarly: true, deadline }, before)).toBe(false);
    expect(canLockNow({ lockedEarly: false, deadline }, after)).toBe(false);
  });

  it("offers Unlock only when locked early and before the deadline", () => {
    expect(canUnlockNow({ lockedEarly: true, deadline }, before)).toBe(true);
    expect(canUnlockNow({ lockedEarly: false, deadline }, before)).toBe(false);
    expect(canUnlockNow({ lockedEarly: true, deadline }, after)).toBe(false);
  });
});

describe("copy", () => {
  it("explains each editing state", () => {
    expect(editingStatus({ ok: true })).toBe("Friends can still edit their answers.");
    expect(editingStatus({ ok: false, reason: "deadline" })).toMatch(/deadline has passed/);
    expect(editingStatus({ ok: false, reason: "locked" })).toMatch(/until you unlock/);
    expect(editingStatus({ ok: false, reason: "final" })).toMatch(/final choice is set/);
  });

  it("asks the Mark-as-final question with the destination and window", () => {
    expect(markFinalQuestion("Goa", "12–16 Dec")).toBe(
      "Mark Goa, 12–16 Dec as the final choice? Friends' answers will lock.",
    );
  });
});
