import { describe, expect, it } from "vitest";
import { capitalise, DEALBREAKER_OPTIONS, parseBudget, prefillFor, readAnswers, TRIP_TYPE_OPTIONS } from "./answers";

describe("parseBudget", () => {
  it("turns plain digits into a number", () => {
    expect(parseBudget("15000")).toBe(15000);
    expect(parseBudget(" 15000 ")).toBe(15000);
  });

  it("accepts commas and a rupee sign, as people type or paste them", () => {
    expect(parseBudget("15,000")).toBe(15000);
    expect(parseBudget("₹ 1,00,000")).toBe(100000);
  });

  it("allows 1 to 10,00,000 inclusive", () => {
    expect(parseBudget("1")).toBe(1);
    expect(parseBudget("1000000")).toBe(1_000_000);
    expect(parseBudget("0")).toBeNull();
    expect(parseBudget("1000001")).toBeNull();
  });

  it("refuses blanks, decimals, negatives and words", () => {
    for (const raw of ["", "   ", "12.5", "-500", "abc", "15k", "1e5", "99999999"]) {
      expect(parseBudget(raw)).toBeNull();
    }
  });
});

describe("prefillFor", () => {
  const saved = {
    deviceId: "phone-A",
    budgetInr: 18000,
    availableWindowIds: ["w1", "w3"],
    dealbreakers: ["trekking"],
    tripType: "hills",
  };

  it("pre-fills everything, budget included, for the same session", () => {
    expect(prefillFor(saved, "phone-A")).toEqual({
      values: { budget: "18000", windowIds: ["w1", "w3"], dealbreakers: ["trekking"], tripType: "hills" },
      retype: false,
    });
  });

  it("never pre-fills the budget from another session, and asks for it again", () => {
    const p = prefillFor(saved, "phone-B");
    expect(p.values.budget).toBe("");
    expect(p.retype).toBe(true);
    expect(JSON.stringify(p)).not.toContain("18000");
    expect(p.values).toMatchObject({ windowIds: ["w1", "w3"], dealbreakers: ["trekking"], tripType: "hills" });
  });

  it("starts blank when nothing is saved yet", () => {
    expect(prefillFor(null, "phone-A")).toEqual({
      values: { budget: "", windowIds: [], dealbreakers: [], tripType: "" },
      retype: false,
    });
  });
});

describe("readAnswers", () => {
  it("reads every field, keeping all ticked boxes", () => {
    const fd = new FormData();
    fd.set("budget", "15,000");
    fd.append("windows", "w1");
    fd.append("windows", "w2");
    fd.append("dealbreakers", "international");
    fd.set("tripType", "beach");
    expect(readAnswers(fd)).toEqual({
      budget: "15,000",
      windowIds: ["w1", "w2"],
      dealbreakers: ["international"],
      tripType: "beach",
    });
  });

  it("allows zero ticked dates and no trip type", () => {
    expect(readAnswers(new FormData())).toEqual({ budget: "", windowIds: [], dealbreakers: [], tripType: "" });
  });
});

describe("options", () => {
  it("offers the five trip types with the values the server accepts", () => {
    expect(TRIP_TYPE_OPTIONS.map((o) => o.value)).toEqual(["beach", "hills", "city", "adventure", "none"]);
    expect(TRIP_TYPE_OPTIONS.map((o) => o.label)).toEqual(["Beach", "Hills", "City", "Adventure", "No preference"]);
  });

  it("offers every dealbreaker tag with a capitalised label", () => {
    expect(DEALBREAKER_OPTIONS).toEqual([
      { value: "international", label: "International travel" },
      { value: "trekking", label: "Trekking" },
      { value: "overnight_journey", label: "An overnight journey" },
    ]);
  });

  it("capitalise only touches the first letter", () => {
    expect(capitalise("an overnight journey")).toBe("An overnight journey");
    expect(capitalise("")).toBe("");
  });
});
