// Scoring engine: pure maths, no database, no clock (see CLAUDE.md).
// Rules: docs/designs/group-trip-decision-tool.md → "Scoring rules".

export type TripType = "beach" | "hills" | "city" | "adventure";
/** "none" = no preference. */
export type TripTypePref = TripType | "none";

/**
 * Dealbreaker tags. Each must match a destination attribute.
 * Placeholder list until the destination sheet is filled in (design doc, Open Question 2).
 */
export const DEALBREAKER_TAGS = ["international", "trekking", "overnight_journey"] as const;
export type DealbreakerTag = (typeof DEALBREAKER_TAGS)[number];

/** Wording used in problem labels, e.g. "Dev: trekking is a dealbreaker". */
export const DEALBREAKER_LABELS: Record<DealbreakerTag, string> = {
  international: "international travel",
  trekking: "trekking",
  overnight_journey: "an overnight journey",
};

/** A candidate date window. Dates are calendar dates, YYYY-MM-DD, both ends inclusive. */
export interface DateWindow {
  id: string;
  label: string;
  start: string;
  end: string;
}

export interface Destination {
  id: string;
  name: string;
  costPerPersonInr: number;
  /** Months 1-12. */
  bestMonths: number[];
  tripType: TripType;
  /** Dealbreaker tags this destination carries. */
  attributes: DealbreakerTag[];
}

export interface ParticipantResponse {
  name: string;
  budgetInr: number;
  availableWindowIds: string[];
  dealbreakers: DealbreakerTag[];
  tripType: TripTypePref;
}

export interface ScoringInput {
  /** All participant names, in the organiser's order. */
  participants: string[];
  /** Only people who have submitted. */
  responses: ParticipantResponse[];
  destinations: Destination[];
  windows: DateWindow[];
}

// ---------- Output ----------

export interface PersonFit {
  name: string;
  /** Whole-number score 0-100; null when blocked. */
  score: number | null;
  /** Rule 8 phrase, or the problem label when blocked. */
  reason: string;
  /** Rule 6 label, or null when this person has no problem with the option. */
  problem: string | null;
}

export interface ShownOption {
  destinationId: string;
  destinationName: string;
  windowId: string;
  windowLabel: string;
  costPerPersonInr: number;
  passes: boolean;
  /** Sum of unblocked people's scores (ranking compares sums; passing options all have the same N). */
  averageSum: number;
  /** Average over unblocked people, 1 decimal, e.g. "86.6" ("0.0" if everyone is blocked). */
  groupAverage: string;
  /** Lowest score among unblocked people; 0 if everyone is blocked. */
  lowestScore: number;
  /** Rule 9 "why it ranks here" line. */
  whyLine: string;
  /** One per submitter, in the organiser's participant order. */
  people: PersonFit[];
}

export interface ResultsOutput {
  totalCount: number;
  submittedCount: number;
  /** Participants who haven't submitted, in organiser order. */
  missing: string[];
  /** "not_enough" with fewer than 2 submitters; `shown` is then empty. */
  status: "not_enough" | "ranked";
  /** Rule 7, e.g. "Based on 4 of 5. Waiting on: Karan." */
  label: string;
  shown: ShownOption[];
}

// ---------- Engine ----------

const FLOOR = 40;
const MAX_PASSING_SHOWN = 3;
const MIN_SHOWN = 2;
const MS_PER_DAY = 86_400_000;

interface Candidate {
  option: ShownOption;
  problemCount: number;
  window: DateWindow;
}

/** Plain code-unit order, so the result never depends on the server's locale. */
function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Round num/den (num ≥ 0, den > 0) half up, using integers only. */
function roundHalfUp(num: number, den: number): number {
  const x = 2 * num + den;
  const y = 2 * den;
  return (x - (x % y)) / y;
}

/** Whole-day number for a YYYY-MM-DD calendar date. UTC, so local time zones never shift it. */
function dayNumber(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / MS_PER_DAY;
}

/** Longest window we'll score; anything longer is bad data (and would make the day loop slow). */
const MAX_WINDOW_DAYS = 366;

/**
 * A window is usable only if both ends are real calendar dates, start ≤ end,
 * and it spans at most MAX_WINDOW_DAYS. Trip creation validates this too; this
 * guard keeps bad stored data from producing NaN scores that pass the floor.
 */
function isUsableWindow(w: DateWindow): boolean {
  const isDate = (s: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    new Date(dayNumber(s) * MS_PER_DAY).toISOString().slice(0, 10) === s;
  if (!isDate(w.start) || !isDate(w.end)) return false;
  const days = dayNumber(w.end) - dayNumber(w.start) + 1;
  return days >= 1 && days <= MAX_WINDOW_DAYS;
}

/** Days in the window (both ends inclusive) and how many of them fall in the best months. */
function seasonDays(window: DateWindow, bestMonths: number[]) {
  const first = dayNumber(window.start);
  const last = dayNumber(window.end);
  let inSeason = 0;
  for (let day = first; day <= last; day++) {
    if (bestMonths.includes(new Date(day * MS_PER_DAY).getUTCMonth() + 1)) inSeason++;
  }
  return { inSeason, total: last - first + 1 };
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function blockedLabel(r: ParticipantResponse, d: Destination, w: DateWindow): string | null {
  if (!r.availableWindowIds.includes(w.id)) return `${r.name} can't make these dates`;
  const tag = DEALBREAKER_TAGS.find((t) => r.dealbreakers.includes(t) && d.attributes.includes(t));
  return tag ? `${r.name}: ${DEALBREAKER_LABELS[tag]} is a dealbreaker` : null;
}

function judgePerson(
  r: ParticipantResponse,
  d: Destination,
  w: DateWindow,
  season: { inSeason: number; total: number; phrase: string },
): PersonFit {
  const blocked = blockedLabel(r, d, w);
  if (blocked) return { name: r.name, score: null, reason: blocked, problem: blocked };

  const cost = d.costPerPersonInr;
  const ceiling = r.budgetInr;
  const comfortable = 10 * cost <= 7 * ceiling;
  const over = cost > ceiling;

  // Budget points as a fraction bNum/bDen (0-100): a straight line from 0.7 x ceiling down to the ceiling.
  const [bNum, bDen] = comfortable ? [100, 1] : over ? [0, 1] : [1000 * (ceiling - cost), 3 * ceiling];
  const typePoints = r.tripType === "none" ? 50 : r.tripType === d.tripType ? 100 : 0;
  // score = 0.5 budget + 0.3 type + 0.2 season, with season = 100 x inSeason / total,
  // kept as one exact fraction so a .5 never rounds the wrong way.
  const { inSeason, total } = season;
  const score = roundHalfUp(
    5 * bNum * total + 3 * typePoints * bDen * total + 200 * inSeason * bDen,
    10 * bDen * total,
  );

  const typePhrase =
    r.tripType === "none" ? "any type" : r.tripType === d.tripType ? `got ${d.tripType}` : `wanted ${r.tripType}`;
  const budgetPhrase = comfortable ? "comfortable on budget" : over ? "over budget" : "tight on budget";
  const problem = over ? `${r.name}: over budget` : score < FLOOR ? `${r.name}: poor overall fit` : null;

  return {
    name: r.name,
    score,
    reason: capitalise([typePhrase, budgetPhrase, season.phrase].join(" · ")),
    problem,
  };
}

function evaluate(d: Destination, w: DateWindow, responses: ParticipantResponse[]): Candidate {
  const { inSeason, total } = seasonDays(w, d.bestMonths);
  const phrase = 2 * inSeason >= total ? "in season" : inSeason > 0 ? "partly in season" : "off season";
  const people = responses.map((r) => judgePerson(r, d, w, { inSeason, total, phrase }));

  const scores = people.flatMap((p) => (p.score === null ? [] : [p.score]));
  const averageSum = scores.reduce((a, b) => a + b, 0);
  const tenths = scores.length ? roundHalfUp(10 * averageSum, scores.length) : 0;
  const problems = people.flatMap((p) => (p.problem === null ? [] : [p.problem]));
  const passes = problems.length === 0;
  const n = responses.length;
  const matches = responses.filter((r) => r.tripType === d.tripType).length;

  return {
    problemCount: problems.length,
    window: w,
    option: {
      destinationId: d.id,
      destinationName: d.name,
      windowId: w.id,
      windowLabel: w.label,
      costPerPersonInr: d.costPerPersonInr,
      passes,
      averageSum,
      groupAverage: `${Math.floor(tenths / 10)}.${tenths % 10}`,
      lowestScore: scores.length ? Math.min(...scores) : 0,
      whyLine: passes
        ? `Everyone can afford it · ${matches} of ${n} got their trip type · ${phrase}`
        : `Problem for ${problems.length} of ${n}: ${problems.join("; ")}`,
      people,
    },
  };
}

/** Cost, then name A-Z; then window and IDs, so the order is total and never relies on sort stability. */
function compareTail(a: Candidate, b: Candidate): number {
  return (
    a.option.costPerPersonInr - b.option.costPerPersonInr ||
    compareText(a.option.destinationName, b.option.destinationName) ||
    compareText(a.window.start, b.window.start) ||
    compareText(a.window.end, b.window.end) ||
    compareText(a.window.id, b.window.id) ||
    compareText(a.option.destinationId, b.option.destinationId)
  );
}

/** Rule 4: group average (compared as a sum), then lowest score. */
function comparePassing(a: Candidate, b: Candidate): number {
  return (
    b.option.averageSum - a.option.averageSum ||
    b.option.lowestScore - a.option.lowestScore ||
    compareTail(a, b)
  );
}

/** Rule 6: fewest people with a problem, then lowest score among unblocked. */
function compareFlagged(a: Candidate, b: Candidate): number {
  return a.problemCount - b.problemCount || b.option.lowestScore - a.option.lowestScore || compareTail(a, b);
}

/** Keep the first (best-ranked) option per destination, skipping destinations already taken. */
function bestPerDestination(sorted: Candidate[], taken: Set<string>): ShownOption[] {
  const out: ShownOption[] = [];
  for (const c of sorted) {
    if (taken.has(c.option.destinationId)) continue;
    taken.add(c.option.destinationId);
    out.push(c.option);
  }
  return out;
}

/** Scoring rules 1-9 from the design doc. Pure: the same input always gives the same output. */
export function computeResults(input: ScoringInput): ResultsOutput {
  const { participants, destinations } = input;
  const windows = input.windows.filter(isUsableWindow);
  // Only the organiser's participants count; a stray name can't change the ranking or the "N of M" label.
  const responses = input.responses
    .filter((r) => participants.includes(r.name))
    .sort((a, b) => participants.indexOf(a.name) - participants.indexOf(b.name));

  const submitted = new Set(responses.map((r) => r.name));
  const missing = participants.filter((p) => !submitted.has(p));
  const based = `Based on ${responses.length} of ${participants.length}.`;
  const label = missing.length ? `${based} Waiting on: ${missing.join(", ")}.` : based;
  const head = { totalCount: participants.length, submittedCount: responses.length, missing, label };

  if (responses.length < 2) return { ...head, status: "not_enough", shown: [] };

  const candidates = destinations.flatMap((d) => windows.map((w) => evaluate(d, w, responses)));
  const passing = candidates.filter((c) => c.option.passes).sort(comparePassing);
  const flagged = candidates.filter((c) => !c.option.passes).sort(compareFlagged);

  // One per destination across both lists (rule 5). When the fill runs, fewer than 2
  // destinations passed, so `taken` holds exactly the shown passing destinations.
  const taken = new Set<string>();
  const shown = bestPerDestination(passing, taken).slice(0, MAX_PASSING_SHOWN);
  if (shown.length < MIN_SHOWN) {
    shown.push(...bestPerDestination(flagged, taken).slice(0, MIN_SHOWN - shown.length));
  }

  return { ...head, status: "ranked", shown };
}
