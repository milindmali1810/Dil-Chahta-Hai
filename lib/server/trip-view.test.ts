import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/data")>()),
  getResponses: vi.fn(),
  getDestinations: vi.fn(),
}));

import { PHOTOS, pickPhoto } from "@/lib/photos";
import type { ParticipantTrip } from "@/lib/server/access";
import { getDestinations, getResponses, toDeadlineIso } from "@/lib/server/data";
import { loadTripView } from "@/lib/server/trip-view";

const NOW = new Date("2026-09-28T12:00:00+05:30");

function trip(overrides: Partial<ParticipantTrip> = {}): ParticipantTrip {
  return {
    id: "trip_abc",
    name: "Goa or bust",
    participantNames: ["Asha", "Bilal", "Karan"],
    windows: [{ id: "w1", label: "12–16 Dec", start: "2026-12-12", end: "2026-12-16" }],
    deadline: toDeadlineIso("2026-09-30", "23:59"),
    pinVersion: 1,
    lockedEarly: false,
    finalDestinationId: null,
    finalWindowId: null,
    createdAt: "2026-09-25T10:00:00+05:30",
    ...overrides,
  };
}

const DESTS = [
  { id: "goa", name: "Goa", costPerPersonInr: 10000, bestMonths: [12], tripType: "beach" as const, attributes: [] },
  { id: "bali", name: "Bali", costPerPersonInr: 60000, bestMonths: [12], tripType: "beach" as const, attributes: ["international" as const] },
];
const RESP = [
  { name: "Asha", budgetInr: 20000, availableWindowIds: ["w1"], dealbreakers: [], tripType: "beach" as const, deviceId: "d1", updatedAt: "2026-09-26T09:42:00Z" },
  { name: "Bilal", budgetInr: 90000, availableWindowIds: ["w1"], dealbreakers: [], tripType: "none" as const, deviceId: "d2", updatedAt: "2026-09-26T10:00:00Z" },
];

afterEach(() => vi.mocked(getResponses).mockReset());

describe("loadTripView", () => {
  it("builds status rows in organiser order, with no budgets", async () => {
    vi.mocked(getResponses).mockResolvedValue(RESP);
    vi.mocked(getDestinations).mockResolvedValue(DESTS);
    const v = await loadTripView(trip(), NOW);
    expect(v.statusRows).toEqual([
      { name: "Asha", submitted: true, updatedAt: "2026-09-26T09:42:00Z" },
      { name: "Bilal", submitted: true, updatedAt: "2026-09-26T10:00:00Z" },
      { name: "Karan", submitted: false, updatedAt: null },
    ]);
    // Reasons may say "comfortable on budget", but no one's budget amount may appear (D2).
    expect(JSON.stringify(v)).not.toMatch(/20000|20,000|90000|90,000|budgetInr/);
  });

  it("marks international destinations and computes results", async () => {
    vi.mocked(getResponses).mockResolvedValue(RESP);
    vi.mocked(getDestinations).mockResolvedValue(DESTS);
    const v = await loadTripView(trip(), NOW);
    expect(v.destinationMeta).toEqual({ goa: { international: false }, bali: { international: true } });
    expect(v.results.label).toBe("Based on 2 of 3. Waiting on: Karan.");
    expect(v.resultsLabel).toMatch(/^Provisional/);
    expect(v.saveCheck).toEqual({ ok: true });
  });

  it("once decided: chosen names, the destination's photo, and locked results", async () => {
    vi.mocked(getResponses).mockResolvedValue(RESP);
    vi.mocked(getDestinations).mockResolvedValue(DESTS);
    const v = await loadTripView(trip({ finalDestinationId: "goa", finalWindowId: "w1" }), NOW);
    expect(v.chosen).toEqual({ destinationId: "goa", windowId: "w1", destinationName: "Goa", windowLabel: "12–16 Dec" });
    expect(v.headerPhoto).toBe(PHOTOS.goa);
    expect(v.resultsLabel).toBe("Results (locked)");
    expect(v.saveCheck).toEqual({ ok: false, reason: "final" });
  });

  it("before a decision the header photo is stable for the trip", async () => {
    vi.mocked(getResponses).mockResolvedValue([]);
    vi.mocked(getDestinations).mockResolvedValue(DESTS);
    const v = await loadTripView(trip(), NOW);
    expect(v.headerPhoto).toBe(pickPhoto("trip_abc"));
  });
});
