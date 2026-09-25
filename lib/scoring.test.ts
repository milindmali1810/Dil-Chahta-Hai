import { describe, expect, it } from "vitest";
import {
  computeResults,
  type DateWindow,
  type Destination,
  type ParticipantResponse,
  type ResultsOutput,
  type ScoringInput,
} from "@/lib/scoring";

// ---------- builders ----------

const DEC: DateWindow = { id: "w-dec", label: "10-14 Dec", start: "2026-12-10", end: "2026-12-14" };
const JAN: DateWindow = { id: "w-jan", label: "7-11 Jan", start: "2027-01-07", end: "2027-01-11" };
const FEB: DateWindow = { id: "w-feb", label: "4-8 Feb", start: "2027-02-04", end: "2027-02-08" };
const MAR: DateWindow = { id: "w-mar", label: "4-8 Mar", start: "2027-03-04", end: "2027-03-08" };

function dest(
  id: string,
  over: Partial<Destination> = {},
): Destination {
  return {
    id,
    name: id.charAt(0).toUpperCase() + id.slice(1),
    costPerPersonInr: 10000,
    bestMonths: [1, 2, 3, 10, 11, 12],
    tripType: "beach",
    attributes: [],
    ...over,
  };
}

function resp(name: string, over: Partial<ParticipantResponse> = {}): ParticipantResponse {
  return {
    name,
    budgetInr: 20000,
    availableWindowIds: [DEC.id],
    dealbreakers: [],
    tripType: "beach",
    ...over,
  };
}

function input(over: Partial<ScoringInput> & Pick<ScoringInput, "responses">): ScoringInput {
  return {
    participants: over.participants ?? over.responses.map((r) => r.name),
    destinations: over.destinations ?? [dest("goa")],
    windows: over.windows ?? [DEC],
    responses: over.responses,
  };
}

function scoresOf(out: ResultsOutput, destinationId: string) {
  const opt = out.shown.find((o) => o.destinationId === destinationId);
  if (!opt) throw new Error(`${destinationId} not shown`);
  return opt.people.map((p) => p.score);
}

/** Every human-readable string the results page renders. */
function allStrings(out: ResultsOutput): string[] {
  return [
    out.label,
    ...out.shown.flatMap((o) => [
      o.whyLine,
      ...o.people.flatMap((p) => [p.reason, p.problem ?? ""]),
    ]),
  ];
}

// ---------- the worked example behind D1 ----------

const GOA = dest("goa", { name: "Goa", tripType: "beach", costPerPersonInr: 10000 });
const MANALI = dest("manali", { name: "Manali", tripType: "hills", costPerPersonInr: 10000 });
const FRIENDS = ["Asha", "Bilal", "Chirag", "Dev", "Esha"];

function goaManali(chiragBudget: number): ScoringInput {
  // Responses deliberately out of organiser order.
  return {
    participants: FRIENDS,
    responses: [
      resp("Esha", { tripType: "none", budgetInr: 15000 }),
      resp("Chirag", { tripType: "hills", budgetInr: chiragBudget }),
      resp("Asha", { tripType: "beach", budgetInr: 20000 }),
      resp("Dev", { tripType: "beach", budgetInr: 25000 }),
      resp("Bilal", { tripType: "beach", budgetInr: 18000 }),
    ],
    destinations: [MANALI, GOA],
    windows: [DEC],
  };
}

describe("worked example (D1): floor, then average", () => {
  it("Chirag at 12000: Goa wins 86.6 vs 74.6", () => {
    const out = computeResults(goaManali(12000));
    expect(out.status).toBe("ranked");
    expect(out.shown.map((o) => o.destinationId)).toEqual(["goa", "manali"]);
    expect(scoresOf(out, "goa")).toEqual([100, 100, 48, 100, 85]);
    expect(scoresOf(out, "manali")).toEqual([70, 70, 78, 70, 85]);
    const [goa, manali] = out.shown;
    expect(goa.people.map((p) => p.name)).toEqual(FRIENDS);
    expect(goa.groupAverage).toBe("86.6");
    expect(manali.groupAverage).toBe("74.6");
    expect(goa.averageSum).toBe(433);
    expect(manali.averageSum).toBe(373);
    expect(goa.lowestScore).toBe(48);
    expect(manali.lowestScore).toBe(70);
    expect(goa.passes).toBe(true);
    expect(manali.passes).toBe(true);
  });

  it("Chirag at 15000: Goa still wins 91.0 vs 79.0", () => {
    const out = computeResults(goaManali(15000));
    expect(out.shown.map((o) => o.destinationId)).toEqual(["goa", "manali"]);
    expect(scoresOf(out, "goa")).toEqual([100, 100, 70, 100, 85]);
    expect(scoresOf(out, "manali")).toEqual([70, 70, 100, 70, 85]);
    expect(out.shown[0].groupAverage).toBe("91.0");
    expect(out.shown[1].groupAverage).toBe("79.0");
  });

  it("reason and why-it-ranks-here strings match rules 8-9 word for word", () => {
    const out = computeResults(goaManali(12000));
    const [goa, manali] = out.shown;
    expect(goa.people.map((p) => p.reason)).toEqual([
      "Got beach · comfortable on budget · in season",
      "Got beach · comfortable on budget · in season",
      "Wanted hills · tight on budget · in season",
      "Got beach · comfortable on budget · in season",
      "Any type · comfortable on budget · in season",
    ]);
    expect(manali.people.map((p) => p.reason)).toEqual([
      "Wanted beach · comfortable on budget · in season",
      "Wanted beach · comfortable on budget · in season",
      "Got hills · tight on budget · in season",
      "Wanted beach · comfortable on budget · in season",
      "Any type · comfortable on budget · in season",
    ]);
    expect(goa.people.every((p) => p.problem === null)).toBe(true);
    expect(goa.whyLine).toBe("Everyone can afford it · 3 of 5 got their trip type · in season");
    expect(manali.whyLine).toBe("Everyone can afford it · 1 of 5 got their trip type · in season");
    expect(goa.windowId).toBe(DEC.id);
    expect(goa.windowLabel).toBe("10-14 Dec");
    expect(goa.destinationName).toBe("Goa");
    expect(goa.costPerPersonInr).toBe(10000);
  });
});

// ---------- SO-1: nothing passes ----------

describe("flagged fallback", () => {
  it("four friends each blocked on a different window still shows options (never empty)", () => {
    const windows = [DEC, JAN, FEB, MAR];
    const all = windows.map((w) => w.id);
    const out = computeResults(
      input({
        participants: FRIENDS,
        windows,
        destinations: [GOA, MANALI],
        responses: [
          resp("Asha", { availableWindowIds: all.filter((id) => id !== DEC.id) }),
          resp("Bilal", { availableWindowIds: all.filter((id) => id !== JAN.id) }),
          resp("Chirag", { availableWindowIds: all.filter((id) => id !== FEB.id) }),
          resp("Dev", { availableWindowIds: all.filter((id) => id !== MAR.id) }),
          resp("Esha", { availableWindowIds: all }),
        ],
      }),
    );
    expect(out.status).toBe("ranked");
    expect(out.shown).toHaveLength(2);
    expect(out.shown.every((o) => !o.passes)).toBe(true);
    expect(out.shown.map((o) => o.destinationId).sort()).toEqual(["goa", "manali"]);
    for (const o of out.shown) {
      expect(o.whyLine).toMatch(/^Problem for 1 of 5: \w+ can't make these dates$/);
      const blocked = o.people.filter((p) => p.score === null);
      expect(blocked).toHaveLength(1);
      expect(blocked[0].reason).toBe(`${blocked[0].name} can't make these dates`);
      expect(blocked[0].problem).toBe(blocked[0].reason);
    }
  });

  it("a window nobody ticked: lowest score counts as 0 and the order is stable", () => {
    const base = input({
      windows: [JAN],
      destinations: [
        dest("goa", { name: "Goa", costPerPersonInr: 9000 }),
        dest("ooty", { name: "Ooty", costPerPersonInr: 8000 }),
        dest("coorg", { name: "Coorg", costPerPersonInr: 8000 }),
      ],
      responses: [resp("Asha"), resp("Bilal"), resp("Chirag")],
    });
    const out = computeResults(base);
    expect(out.shown.map((o) => o.destinationId)).toEqual(["coorg", "ooty"]);
    for (const o of out.shown) {
      expect(o.passes).toBe(false);
      expect(o.lowestScore).toBe(0);
      expect(o.averageSum).toBe(0);
      expect(o.people.every((p) => p.score === null)).toBe(true);
      expect(o.whyLine).toBe(
        "Problem for 3 of 3: Asha can't make these dates; Bilal can't make these dates; Chirag can't make these dates",
      );
    }
    // Same answer on refresh and whatever order the rows come back in.
    expect(computeResults(base)).toEqual(out);
    const shuffled = { ...base, destinations: [...base.destinations].reverse() };
    expect(computeResults(shuffled)).toEqual(out);
  });

  it("an unticked window never beats a ticked one for the same destination", () => {
    const out = computeResults(
      input({
        windows: [JAN, DEC],
        destinations: [dest("goa", { name: "Goa", attributes: ["trekking"] })],
        responses: [
          resp("Asha", { availableWindowIds: [DEC.id], dealbreakers: ["trekking"] }),
          resp("Bilal", { availableWindowIds: [DEC.id] }),
        ],
      }),
    );
    expect(out.shown).toHaveLength(1);
    expect(out.shown[0].windowId).toBe(DEC.id);
    expect(out.shown[0].lowestScore).toBe(100);
    expect(out.shown[0].whyLine).toBe("Problem for 1 of 2: Asha: trekking is a dealbreaker");
  });
});

// ---------- rule 7: partial responses ----------

describe("partial responses", () => {
  it("one submitter: no ranking", () => {
    const out = computeResults(
      input({ participants: FRIENDS, responses: [resp("Asha")] }),
    );
    expect(out.status).toBe("not_enough");
    expect(out.shown).toEqual([]);
    expect(out.submittedCount).toBe(1);
    expect(out.totalCount).toBe(5);
    expect(out.label).toBe("Based on 1 of 5. Waiting on: Bilal, Chirag, Dev, Esha.");
  });

  it("zero submitters: no ranking", () => {
    const out = computeResults(input({ participants: FRIENDS, responses: [] }));
    expect(out.status).toBe("not_enough");
    expect(out.shown).toEqual([]);
    expect(out.missing).toEqual(FRIENDS);
  });

  it("4 of 5 submitters: the label names who is missing", () => {
    const out = computeResults(
      input({
        participants: ["Asha", "Bilal", "Karan", "Dev", "Esha"],
        responses: [resp("Esha"), resp("Asha"), resp("Dev"), resp("Bilal")],
      }),
    );
    expect(out.status).toBe("ranked");
    expect(out.totalCount).toBe(5);
    expect(out.submittedCount).toBe(4);
    expect(out.missing).toEqual(["Karan"]);
    expect(out.label).toBe("Based on 4 of 5. Waiting on: Karan.");
    expect(out.shown[0].people.map((p) => p.name)).toEqual(["Asha", "Bilal", "Dev", "Esha"]);
  });

  it("several missing are listed in organiser order", () => {
    const out = computeResults(
      input({ participants: FRIENDS, responses: [resp("Dev"), resp("Bilal")] }),
    );
    expect(out.label).toBe("Based on 2 of 5. Waiting on: Asha, Chirag, Esha.");
  });

  it("everyone in: no waiting list", () => {
    const out = computeResults(goaManali(12000));
    expect(out.missing).toEqual([]);
    expect(out.label).toBe("Based on 5 of 5.");
  });
});

// ---------- ranking and dedupe ----------

describe("ranking and picking what to show", () => {
  it("an exact tie is broken by cost, then name, and is identical on refresh", () => {
    const base = input({
      destinations: [
        dest("goa", { name: "Goa", costPerPersonInr: 9000 }),
        dest("ooty", { name: "Ooty", costPerPersonInr: 8000 }),
        dest("coorg", { name: "Coorg", costPerPersonInr: 8000 }),
      ],
      responses: [resp("Asha"), resp("Bilal")],
    });
    const out = computeResults(base);
    // All score 100 / 100: same sum, same lowest.
    expect(out.shown.map((o) => o.averageSum)).toEqual([200, 200, 200]);
    expect(out.shown.map((o) => o.lowestScore)).toEqual([100, 100, 100]);
    expect(out.shown.map((o) => o.destinationId)).toEqual(["coorg", "ooty", "goa"]);
    expect(computeResults(base)).toEqual(out);
    const shuffled = {
      ...base,
      destinations: [base.destinations[1], base.destinations[0], base.destinations[2]],
      responses: [...base.responses].reverse(),
    };
    expect(computeResults(shuffled)).toEqual(out);
  });

  it("higher average beats a higher lowest score (floor, then average)", () => {
    const out = computeResults(goaManali(12000));
    expect(out.shown[0].lowestScore).toBeLessThan(out.shown[1].lowestScore);
    expect(out.shown[0].destinationId).toBe("goa");
  });

  it("lowest score breaks an average tie (before cost and name)", () => {
    const out = computeResults(
      input({
        destinations: [
          // Off season in Dec: beach fans 80, hills fan 50. Sum 210, lowest 50.
          dest("alpha", { name: "Alpha", tripType: "beach", bestMonths: [6] }),
          // In season, nobody's type: 70 each. Sum 210, lowest 70.
          dest("bravo", { name: "Bravo", tripType: "city" }),
        ],
        responses: [
          resp("Asha", { tripType: "beach" }),
          resp("Bilal", { tripType: "beach" }),
          resp("Chirag", { tripType: "hills" }),
        ],
      }),
    );
    expect(out.shown.map((o) => [o.destinationId, o.averageSum, o.lowestScore])).toEqual([
      ["bravo", 210, 70],
      ["alpha", 210, 50],
    ]);
    expect(out.shown[0].whyLine).toBe("Everyone can afford it · 0 of 3 got their trip type · in season");
    expect(out.shown[1].whyLine).toBe("Everyone can afford it · 2 of 3 got their trip type · off season");
  });

  it("shows at most 3 passing options", () => {
    const out = computeResults(
      input({
        destinations: ["a", "b", "c", "d", "e"].map((id) => dest(id)),
        responses: [resp("Asha"), resp("Bilal")],
      }),
    );
    expect(out.shown.map((o) => o.destinationId)).toEqual(["a", "b", "c"]);
  });

  it("one destination best in several windows appears once, in its best window", () => {
    const out = computeResults(
      input({
        windows: [DEC, JAN, FEB],
        destinations: [
          dest("goa", { name: "Goa", costPerPersonInr: 5000, bestMonths: [12, 1, 2] }),
          dest("coorg", { name: "Coorg", costPerPersonInr: 9000, bestMonths: [1] }),
          dest("ooty", { name: "Ooty", costPerPersonInr: 9500, bestMonths: [1] }),
        ],
        responses: [
          resp("Asha", { availableWindowIds: [DEC.id, JAN.id, FEB.id], budgetInr: 12000 }),
          resp("Bilal", { availableWindowIds: [DEC.id, JAN.id, FEB.id], budgetInr: 12000 }),
        ],
      }),
    );
    // Goa scores 100 in all three windows, beating Coorg/Ooty anywhere; it must still appear once.
    // Its windows tie exactly, so the earliest window is kept.
    expect(out.shown.map((o) => o.destinationId)).toEqual(["goa", "coorg", "ooty"]);
    expect(out.shown.map((o) => o.windowId)).toEqual([DEC.id, JAN.id, JAN.id]);
  });

  it("a destination passing in one window and flagged in another appears once, as passing", () => {
    const out = computeResults(
      input({
        windows: [DEC, JAN],
        destinations: [
          dest("goa", { name: "Goa" }),
          dest("manali", { name: "Manali", tripType: "hills", attributes: ["trekking"] }),
        ],
        responses: [
          // Bilal can't make Jan, so Goa-Jan is flagged with 1 problem.
          resp("Asha", { availableWindowIds: [DEC.id, JAN.id], dealbreakers: ["trekking"] }),
          resp("Bilal", { availableWindowIds: [DEC.id], dealbreakers: ["trekking"] }),
          resp("Chirag", { availableWindowIds: [DEC.id, JAN.id] }),
        ],
      }),
    );
    // Only Goa-Dec passes. Goa-Jan (1 problem) would outrank Manali (2+ problems)
    // in the flagged fill, but Goa is already shown.
    expect(out.shown.map((o) => [o.destinationId, o.windowId, o.passes])).toEqual([
      ["goa", DEC.id, true],
      ["manali", DEC.id, false],
    ]);
    expect(out.shown[1].whyLine).toBe(
      "Problem for 2 of 3: Asha: trekking is a dealbreaker; Bilal: trekking is a dealbreaker",
    );
  });

  it("does not fill with flagged options when 2 or more pass", () => {
    const out = computeResults(
      input({
        destinations: [dest("goa"), dest("ooty"), dest("vegas", { attributes: ["international"] })],
        responses: [resp("Asha", { dealbreakers: ["international"] }), resp("Bilal")],
      }),
    );
    expect(out.shown.map((o) => o.destinationId)).toEqual(["goa", "ooty"]);
    expect(out.shown.every((o) => o.passes)).toBe(true);
  });

  it("one passing option is topped up with one flagged option", () => {
    const out = computeResults(
      input({
        destinations: [
          dest("goa"),
          dest("vegas", { name: "Vegas", attributes: ["international"] }),
          dest("leh", { name: "Leh", attributes: ["international", "trekking"] }),
        ],
        responses: [resp("Asha", { dealbreakers: ["international"] }), resp("Bilal")],
      }),
    );
    expect(out.shown.map((o) => [o.destinationId, o.passes])).toEqual([
      ["goa", true],
      ["leh", false], // same problem count and lowest as Vegas, same cost; "Leh" < "Vegas"
    ]);
  });
});

// ---------- problem labels ----------

describe("problem labels", () => {
  it("a person with two problems gets only the first label; labels join with '; '", () => {
    const out = computeResults(
      input({
        participants: ["Asha", "Bilal", "Chirag"],
        destinations: [dest("leh", { name: "Leh", attributes: ["trekking"], costPerPersonInr: 10000 })],
        responses: [
          // dates AND dealbreaker AND over budget -> dates only
          resp("Asha", { availableWindowIds: [], dealbreakers: ["trekking"], budgetInr: 5000 }),
          resp("Bilal"),
          // over budget AND poor fit -> over budget only
          resp("Chirag", { budgetInr: 9000, tripType: "hills" }),
        ],
      }),
    );
    const [leh] = out.shown;
    expect(leh.passes).toBe(false);
    expect(leh.whyLine).toBe("Problem for 2 of 3: Asha can't make these dates; Chirag: over budget");
    expect(leh.people.map((p) => p.problem)).toEqual([
      "Asha can't make these dates",
      null,
      "Chirag: over budget",
    ]);
    expect(leh.people[0]).toEqual({
      name: "Asha",
      score: null,
      reason: "Asha can't make these dates",
      problem: "Asha can't make these dates",
    });
    // Over budget but unblocked: still scored and given a normal reason.
    expect(leh.people[2].score).toBe(20);
    expect(leh.people[2].reason).toBe("Wanted hills · over budget · in season");
    expect(leh.lowestScore).toBe(20);
  });

  it("dealbreaker beats over budget; first tag in DEALBREAKER_TAGS order is named", () => {
    const out = computeResults(
      input({
        destinations: [
          dest("bali", { name: "Bali", attributes: ["overnight_journey", "trekking", "international"] }),
        ],
        responses: [
          resp("Dev", { dealbreakers: ["overnight_journey", "trekking"], budgetInr: 1000 }),
          resp("Esha", { dealbreakers: ["overnight_journey"] }),
        ],
      }),
    );
    expect(out.shown[0].people.map((p) => p.problem)).toEqual([
      "Dev: trekking is a dealbreaker",
      "Esha: an overnight journey is a dealbreaker",
    ]);
    expect(out.shown[0].lowestScore).toBe(0);
    expect(out.shown[0].groupAverage).toBe("0.0");
  });

  it("international travel label", () => {
    const out = computeResults(
      input({
        destinations: [dest("bali", { name: "Bali", attributes: ["international"] })],
        responses: [resp("Dev", { dealbreakers: ["international"] }), resp("Esha")],
      }),
    );
    expect(out.shown[0].whyLine).toBe("Problem for 1 of 2: Dev: international travel is a dealbreaker");
    // Average is over the unblocked people only.
    expect(out.shown[0].averageSum).toBe(100);
    expect(out.shown[0].groupAverage).toBe("100.0");
  });

  it("fewer problems ranks first among flagged options", () => {
    const out = computeResults(
      input({
        destinations: [
          dest("aaa", { name: "Aaa", attributes: ["trekking"], costPerPersonInr: 100 }),
          dest("zzz", { name: "Zzz", attributes: ["international"], costPerPersonInr: 99999 }),
        ],
        responses: [
          resp("Asha", { dealbreakers: ["trekking", "international"] }),
          resp("Bilal", { dealbreakers: ["trekking"], budgetInr: 200000 }),
          resp("Chirag", { budgetInr: 200000 }),
        ],
      }),
    );
    // Aaa: 2 problems (cheap, A-Z first). Zzz: 1 problem.
    expect(out.shown.map((o) => o.destinationId)).toEqual(["zzz", "aaa"]);
  });
});

// ---------- rule 2 / rule 8 boundaries ----------

describe("score boundaries", () => {
  function one(budgetInr: number, over: Partial<ParticipantResponse> = {}, d: Partial<Destination> = {}) {
    const out = computeResults(
      input({
        destinations: [dest("goa", { name: "Goa", costPerPersonInr: 10000, ...d })],
        responses: [resp("Asha", { budgetInr, ...over }), resp("Zed", { budgetInr: 100000 })],
      }),
    );
    return { opt: out.shown[0], person: out.shown[0].people[0] };
  }

  it("cost exactly 0.7 x ceiling: full budget points, comfortable", () => {
    // 10000 = 0.7 x 14285.71..., so use a ceiling where 0.7c is a whole number.
    const { person } = one(10000, {}, { costPerPersonInr: 7000 });
    expect(person.score).toBe(100);
    expect(person.reason).toBe("Got beach · comfortable on budget · in season");
  });

  it("one rupee above 0.7 x ceiling: tight", () => {
    const { person } = one(10000, {}, { costPerPersonInr: 7001 });
    expect(person.score).toBe(100); // 50*0.99966.. + 30 + 20 rounds to 100
    expect(person.reason).toBe("Got beach · tight on budget · in season");
  });

  it("cost exactly = ceiling: 0 budget points, tight, not over", () => {
    const { opt, person } = one(10000);
    expect(person.score).toBe(50);
    expect(person.problem).toBeNull();
    expect(person.reason).toBe("Got beach · tight on budget · in season");
    expect(opt.passes).toBe(true);
  });

  it("ceiling one rupee below cost: over budget", () => {
    const { opt, person } = one(9999);
    expect(person.score).toBe(50);
    expect(person.problem).toBe("Asha: over budget");
    expect(person.reason).toBe("Got beach · over budget · in season");
    expect(opt.passes).toBe(false);
  });

  it("type: none gets half points, mismatch gets none", () => {
    expect(one(20000, { tripType: "none" }).person.score).toBe(85);
    expect(one(20000, { tripType: "city" }).person.score).toBe(70);
    expect(one(20000, { tripType: "city" }).person.reason).toBe(
      "Wanted city · comfortable on budget · in season",
    );
  });

  it("season: share of days, both ends inclusive, across a month boundary", () => {
    const w = (start: string, end: string): DateWindow => ({ id: "w", label: "w", start, end });
    const run = (win: DateWindow, bestMonths: number[]) =>
      computeResults(
        input({
          windows: [win],
          destinations: [dest("goa", { name: "Goa", costPerPersonInr: 5000, bestMonths })],
          responses: [resp("Asha", { availableWindowIds: ["w"] }), resp("Bilal", { availableWindowIds: ["w"] })],
        }),
      ).shown[0];
    // 29 Nov - 2 Dec: 2 of 4 days in Dec -> 0.5 -> in season, 50 points.
    const half = run(w("2026-11-29", "2026-12-02"), [12]);
    expect(half.people[0].score).toBe(90);
    expect(half.people[0].reason).toBe("Got beach · comfortable on budget · in season");
    expect(half.whyLine).toBe("Everyone can afford it · 2 of 2 got their trip type · in season");
    // 28 Nov - 2 Dec: 2 of 5 days -> 0.4 -> partly, 40 points.
    const partly = run(w("2026-11-28", "2026-12-02"), [12]);
    expect(partly.people[0].score).toBe(88);
    expect(partly.people[0].reason).toBe("Got beach · comfortable on budget · partly in season");
    expect(partly.whyLine).toBe("Everyone can afford it · 2 of 2 got their trip type · partly in season");
    // Off season.
    const off = run(w("2026-11-28", "2026-12-02"), [6]);
    expect(off.people[0].score).toBe(80);
    expect(off.people[0].reason).toBe("Got beach · comfortable on budget · off season");
    // A one-day window and a window over a DST change elsewhere / leap day still count whole days.
    expect(run(w("2028-02-29", "2028-02-29"), [2]).people[0].score).toBe(100);
    expect(run(w("2027-03-27", "2027-04-02"), [3]).people[0].reason).toBe(
      "Got beach · comfortable on budget · in season", // 5 of 7 days in March
    );
    // Year boundary: 30 Dec - 2 Jan, only Jan is best -> 2 of 4.
    expect(run(w("2026-12-30", "2027-01-02"), [1]).people[0].score).toBe(90);
  });

  it("floor: exactly 40 passes, 39 fails as poor overall fit", () => {
    const out = computeResults(
      input({
        destinations: [
          // Chirag (hills, budget 10000) on a beach trip: 0.5*budget + 0 + 20.
          dest("alpha", { name: "Alpha", costPerPersonInr: 8800 }), // budget 40 -> 20 + 20 = 40
          dest("bravo", { name: "Bravo", costPerPersonInr: 8860 }), // budget 38 -> 19 + 20 = 39
        ],
        responses: [resp("Asha", { budgetInr: 50000 }), resp("Chirag", { tripType: "hills", budgetInr: 10000 })],
      }),
    );
    const [alpha, bravo] = out.shown;
    expect(alpha.destinationId).toBe("alpha");
    expect(alpha.passes).toBe(true);
    expect(alpha.lowestScore).toBe(40);
    expect(alpha.people[1].problem).toBeNull();
    expect(bravo.destinationId).toBe("bravo");
    expect(bravo.passes).toBe(false);
    expect(bravo.lowestScore).toBe(39);
    expect(bravo.people[1].problem).toBe("Chirag: poor overall fit");
    expect(bravo.people[1].reason).toBe("Wanted hills · tight on budget · in season");
    expect(bravo.whyLine).toBe("Problem for 1 of 2: Chirag: poor overall fit");
  });

  it("no rupee amount appears in any string", () => {
    const outs = [
      computeResults(goaManali(12000)),
      computeResults(goaManali(15000)),
      computeResults(
        input({
          participants: ["Asha", "Bilal", "Chirag"],
          destinations: [dest("leh", { name: "Leh", attributes: ["trekking"], costPerPersonInr: 10000 })],
          responses: [
            resp("Asha", { availableWindowIds: [] }),
            resp("Bilal", { budgetInr: 12345 }),
            resp("Chirag", { budgetInr: 9000 }),
          ],
        }),
      ),
    ];
    for (const out of outs) {
      for (const s of allStrings(out)) {
        expect(s).not.toMatch(/₹|Rs\.?\s|INR|\d{4,}|\d,\d{3}/);
        expect(s).not.toContain("10000");
        expect(s).not.toContain("12345");
      }
    }
  });
});
