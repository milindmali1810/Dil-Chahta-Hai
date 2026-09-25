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
