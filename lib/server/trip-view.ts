import "server-only";

import { destinationPhoto, pickPhoto, type Photo } from "@/lib/photos";
import { computeResults, type ResultsOutput } from "@/lib/scoring";
import type { ParticipantTrip } from "./access";
import { canSave, getDestinations, getResponses, resultsLabel, type SaveCheck } from "./data";

/**
 * Everything the trip home (/t/[tripId]) and organiser (/o/[tripId]/[token]) pages
 * show about a trip, loaded once. Takes the secret-free ParticipantTrip view, so it
 * can never leak the PIN or organiser token; the organiser page passes its full
 * Trip, which is a superset. No budgets leave this function: status rows carry only
 * names and times, and results carry scores and reasons (D2).
 */
export interface TripView {
  results: ResultsOutput;
  /** For the Domestic/International badge on each result card. */
  destinationMeta: Record<string, { international: boolean }>;
  statusRows: { name: string; submitted: boolean; updatedAt: string | null }[];
  /** The chosen destination's photo once decided, otherwise a stable pick for this trip. */
  headerPhoto: Photo;
  /** Set once the organiser has marked a final choice (SO-3). */
  chosen: { destinationId: string; windowId: string; destinationName: string; windowLabel: string } | null;
  /** "Results (locked)" or "Provisional: can change until …" (R-1). */
  resultsLabel: string;
  /** Whether friends can still save answers, and if not, why. */
  saveCheck: SaveCheck;
}

export async function loadTripView(trip: ParticipantTrip, now: Date): Promise<TripView> {
  const [responses, destinations] = await Promise.all([getResponses(trip.id), getDestinations()]);

  const results = computeResults({
    participants: trip.participantNames,
    responses,
    destinations,
    windows: trip.windows,
  });

  const saved = new Map(responses.map((r) => [r.name, r.updatedAt]));
  const statusRows = trip.participantNames.map((name) => ({
    name,
    submitted: saved.has(name),
    updatedAt: saved.get(name) ?? null,
  }));

  const destinationMeta = Object.fromEntries(
    destinations.map((d) => [d.id, { international: d.attributes.includes("international") }]),
  );

  let chosen: TripView["chosen"] = null;
  if (trip.finalDestinationId && trip.finalWindowId) {
    const d = destinations.find((x) => x.id === trip.finalDestinationId);
    const w = trip.windows.find((x) => x.id === trip.finalWindowId);
    chosen = {
      destinationId: trip.finalDestinationId,
      windowId: trip.finalWindowId,
      destinationName: d?.name ?? trip.finalDestinationId,
      windowLabel: w?.label ?? trip.finalWindowId,
    };
  }

  const headerPhoto = (chosen && destinationPhoto(chosen.destinationId)) || pickPhoto(trip.id);

  return {
    results,
    destinationMeta,
    statusRows,
    headerPhoto,
    chosen,
    resultsLabel: resultsLabel(trip, now),
    saveCheck: canSave(trip, now),
  };
}
