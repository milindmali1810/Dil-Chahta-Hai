// Pure helpers for the answers form. Imported by the server page and the client form,
// so nothing here may import lib/server/*.

import { DEALBREAKER_LABELS, DEALBREAKER_TAGS, type DealbreakerTag, type TripTypePref } from "@/lib/scoring";

/** Same limit and wording as parseResponseInput in lib/server/data.ts. */
export const BUDGET_MAX_INR = 1_000_000;
export const BUDGET_ERROR = "Enter your budget in whole rupees, from 1 to 10,00,000.";

export const TRIP_TYPE_OPTIONS: { value: TripTypePref; label: string }[] = [
  { value: "beach", label: "Beach" },
  { value: "hills", label: "Hills" },
  { value: "city", label: "City" },
  { value: "adventure", label: "Adventure" },
  { value: "none", label: "No preference" },
];

/** "international travel" → "International travel". */
export function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export const DEALBREAKER_OPTIONS: { value: DealbreakerTag; label: string }[] = DEALBREAKER_TAGS.map((tag) => ({
  value: tag,
  label: capitalise(DEALBREAKER_LABELS[tag]),
}));

/**
 * The budget as typed → a whole number of rupees, or null if it isn't one in range.
 * Allows what people naturally type or paste: "15000", "15,000", "₹ 15,000".
 */
export function parseBudget(raw: string): number | null {
  const digits = raw.replace(/[\s,₹]/g, "");
  if (!/^\d{1,7}$/.test(digits)) return null;
  const n = Number(digits);
  return n >= 1 && n <= BUDGET_MAX_INR ? n : null;
}

/** What the form shows (and keeps showing after a save). */
export interface AnswerValues {
  budget: string;
  windowIds: string[];
  dealbreakers: string[];
  tripType: string;
}

export function readAnswers(formData: FormData): AnswerValues {
  return {
    budget: String(formData.get("budget") ?? ""),
    windowIds: formData.getAll("windows").map(String),
    dealbreakers: formData.getAll("dealbreakers").map(String),
    tripType: String(formData.get("tripType") ?? ""),
  };
}

export interface Prefill {
  values: AnswerValues;
  /** Answers exist for this name but came from another session: the budget must be typed again. */
  retype: boolean;
}

/** The fields of a saved response the form needs (a StoredResponse fits). */
export interface SavedAnswers {
  deviceId: string;
  budgetInr: number;
  availableWindowIds: string[];
  dealbreakers: string[];
  tripType: string;
}

/**
 * Pre-fill from this person's saved answers. The budget is included ONLY when they were
 * saved from this phone's session (same device ID); otherwise it stays blank, so picking
 * a friend's name never reveals their budget (design doc, "Wrong-name guard").
 */
export function prefillFor(saved: SavedAnswers | null, deviceId: string): Prefill {
  if (!saved) return { values: { budget: "", windowIds: [], dealbreakers: [], tripType: "" }, retype: false };
  const sameSession = saved.deviceId === deviceId;
  return {
    values: {
      budget: sameSession ? String(saved.budgetInr) : "",
      windowIds: [...saved.availableWindowIds],
      dealbreakers: [...saved.dealbreakers],
      tripType: saved.tripType,
    },
    retype: !sameSession,
  };
}
