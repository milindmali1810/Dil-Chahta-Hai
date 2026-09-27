import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PHOTOS, pickPhoto } from "@/lib/photos";
import { LOAD_ERROR, lockReason, NO_TRIP, PIN_CHANGED, SAVE_BLOCKED, tripHeaderPhoto } from "./helpers";

const actionsSource = readFileSync(fileURLToPath(new URL("../../actions.ts", import.meta.url)), "utf8");

describe("wording copied from app/actions.ts", () => {
  it.each([NO_TRIP, PIN_CHANGED, LOAD_ERROR, ...Object.values(SAVE_BLOCKED)])("%s", (message) => {
    expect(actionsSource).toContain(`"${message}"`);
  });
});

describe("lockReason", () => {
  it("is null while answers can be saved", () => {
    expect(lockReason({ ok: true })).toBeNull();
  });

  it("gives the exact reason for each lock", () => {
    expect(lockReason({ ok: false, reason: "deadline" })).toBe("The deadline has passed, so answers are locked.");
    expect(lockReason({ ok: false, reason: "locked" })).toBe("The organiser has locked the trip.");
    expect(lockReason({ ok: false, reason: "final" })).toBe(
      "A final decision has been made, so answers are locked.",
    );
  });
});

describe("tripHeaderPhoto", () => {
  it("uses the stable per-trip pick when nothing is decided", () => {
    const trip = { id: "abc123", finalDestinationId: null, finalWindowId: null };
    expect(tripHeaderPhoto(trip)).toBe(pickPhoto("abc123"));
  });

  it("uses the chosen destination's photo once decided", () => {
    const trip = { id: "abc123", finalDestinationId: "santorini", finalWindowId: "w1" };
    expect(tripHeaderPhoto(trip)).toBe(PHOTOS.santorini);
  });

  it("falls back to the per-trip pick when the chosen place has no photo", () => {
    const trip = { id: "abc123", finalDestinationId: "manali", finalWindowId: "w1" };
    expect(tripHeaderPhoto(trip)).toBe(pickPhoto("abc123"));
  });

  it("needs both halves of the final choice, like loadTripView", () => {
    const trip = { id: "abc123", finalDestinationId: "santorini", finalWindowId: null };
    expect(tripHeaderPhoto(trip)).toBe(pickPhoto("abc123"));
  });
});
