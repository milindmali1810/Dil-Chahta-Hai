// Pure helpers for the create-trip form: row limits, building the `createTrip` input,
// and working out which field a server message is about. No React, no server imports.

// Mirrors lib/server/data.ts (PARTICIPANTS_MIN/MAX, WINDOWS_MIN/MAX, DEFAULT_DEADLINE_TIME),
// which is server-only and can't be imported into a client component.
export const NAMES_START = 5;
export const NAMES_MIN = 2;
export const NAMES_MAX = 10;
export const WINDOWS_MIN = 3;
export const WINDOWS_MAX = 4;
export const DEFAULT_DEADLINE_TIME = "23:59";

export interface CreateTripFormValues {
  tripName: string;
  participantNames: string[];
  windows: { start: string; end: string }[];
  deadlineDate: string;
  deadlineTime: string;
}

/** Reads the create form: repeated fields come back in the order they appear on screen. */
export function formValuesFrom(formData: FormData): CreateTripFormValues {
  const text = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "");
  const starts = formData.getAll("windowStart").map(text);
  const ends = formData.getAll("windowEnd").map(text);
  return {
    tripName: text(formData.get("tripName")),
    participantNames: formData.getAll("participantName").map(text),
    windows: starts.map((start, i) => ({ start, end: ends[i] ?? "" })),
    deadlineDate: text(formData.get("deadlineDate")),
    deadlineTime: text(formData.get("deadlineTime")),
  };
}

/**
 * The object `createTrip` expects. Blank name rows are dropped (the form starts with 5
 * rows, and a group of 3 shouldn't have to delete the other 2). Date rows are kept as they
 * are, so "Date option 2" in a server message still means the second row on screen.
 */
export function buildCreateTripInput(values: CreateTripFormValues): CreateTripFormValues {
  return {
    ...values,
    participantNames: values.participantNames.filter((n) => n.trim() !== ""),
  };
}

export type ErrorField =
  | { kind: "tripName" }
  | { kind: "names" }
  | { kind: "windows" }
  | { kind: "window"; index: number }
  | { kind: "deadline" };

/**
 * Which part of the form a `createTrip` message is about, so it can also be shown under
 * that field. Returns null for general messages (e.g. a connection failure).
 */
export function errorFieldFor(message: string): ErrorField | null {
  const m = message.toLowerCase();
  // This one quotes a person's name, which could contain anything: match it first.
  if (m.startsWith("each name must be different")) return { kind: "names" };
  if (m.includes("trip name") || m.startsWith("give the trip a name")) return { kind: "tripName" };
  const option = /date option (\d+)/.exec(m);
  if (option) return { kind: "window", index: Number(option[1]) - 1 };
  if (m.includes("date options")) return { kind: "windows" };
  if (m.includes("deadline")) return { kind: "deadline" };
  if (m.includes("name") || m.includes("people")) return { kind: "names" };
  return null;
}
