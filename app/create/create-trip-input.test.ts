import { describe, expect, it } from "vitest";
import { buildCreateTripInput, errorFieldFor, formValuesFrom } from "./create-trip-input";

describe("formValuesFrom", () => {
  it("reads repeated fields in order and pairs start and end dates", () => {
    const fd = new FormData();
    fd.append("tripName", "Goa gang");
    for (const n of ["Asha", "", "Bilal"]) fd.append("participantName", n);
    for (const [s, e] of [
      ["2026-12-12", "2026-12-16"],
      ["", ""],
      ["2027-01-20", "2027-01-24"],
    ]) {
      fd.append("windowStart", s);
      fd.append("windowEnd", e);
    }
    fd.append("deadlineDate", "2026-10-30");
    fd.append("deadlineTime", "23:59");
    expect(formValuesFrom(fd)).toEqual({
      tripName: "Goa gang",
      participantNames: ["Asha", "", "Bilal"],
      windows: [
        { start: "2026-12-12", end: "2026-12-16" },
        { start: "", end: "" },
        { start: "2027-01-20", end: "2027-01-24" },
      ],
      deadlineDate: "2026-10-30",
      deadlineTime: "23:59",
    });
  });

  it("returns empty strings for missing fields", () => {
    expect(formValuesFrom(new FormData())).toEqual({
      tripName: "",
      participantNames: [],
      windows: [],
      deadlineDate: "",
      deadlineTime: "",
    });
  });
});

describe("buildCreateTripInput", () => {
  it("drops blank name rows and keeps every date row in order", () => {
    const input = buildCreateTripInput({
      tripName: "Goa gang",
      participantNames: ["Asha", "", "  ", "Bilal", "Chirag"],
      windows: [
        { start: "2026-12-12", end: "2026-12-16" },
        { start: "", end: "" },
        { start: "2027-01-20", end: "2027-01-24" },
      ],
      deadlineDate: "2026-10-30",
      deadlineTime: "23:59",
    });
    expect(input.participantNames).toEqual(["Asha", "Bilal", "Chirag"]);
    expect(input.windows).toHaveLength(3);
    expect(input.windows[1]).toEqual({ start: "", end: "" });
    expect(input.tripName).toBe("Goa gang");
    expect(input.deadlineTime).toBe("23:59");
  });
});

describe("errorFieldFor", () => {
  it.each([
    ["Give the trip a name.", { kind: "tripName" }],
    ["Keep the trip name to 60 characters or fewer.", { kind: "tripName" }],
    ["Add at least 2 people.", { kind: "names" }],
    ["You can add up to 10 people.", { kind: "names" }],
    ["Names can't be blank.", { kind: "names" }],
    ["Keep each name to 30 characters or fewer.", { kind: "names" }],
    ['Each name must be different. "Asha" is there twice.', { kind: "names" }],
    ['Each name must be different. "Date option 2" is there twice.', { kind: "names" }],
    ["Add 3 or 4 date options.", { kind: "windows" }],
    ["Date option 2 needs a start and an end date.", { kind: "window", index: 1 }],
    ["Date option 4 has a date that doesn't exist.", { kind: "window", index: 3 }],
    ["In date option 3, the end date is before the start date.", { kind: "window", index: 2 }],
    ["Date option 1 is longer than a year. Check the years.", { kind: "window", index: 0 }],
    ["Pick a deadline date.", { kind: "deadline" }],
    ["Pick a real deadline date and time.", { kind: "deadline" }],
    ["The deadline must be in the future.", { kind: "deadline" }],
  ])("%s", (message, field) => {
    expect(errorFieldFor(message)).toEqual(field);
  });

  it("returns null for general messages", () => {
    expect(errorFieldFor("Couldn't create the trip. Check your connection and try again.")).toBeNull();
    expect(errorFieldFor("Something's missing. Fill in the form and try again.")).toBeNull();
  });
});
