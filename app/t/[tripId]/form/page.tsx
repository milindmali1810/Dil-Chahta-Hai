// Answers form (/t/[tripId]/form). Needs the PIN and a name; otherwise back to the trip home.

import { redirect } from "next/navigation";
import { requireParticipant, type ParticipantTrip } from "@/lib/server/access";
import { canSave, formatDeadlineIst, getResponses } from "@/lib/server/data";
import { loadTripView, type TripView } from "@/lib/server/trip-view";
import { DecisionBanner } from "@/app/ui/decision-banner";
import { Page } from "@/app/ui/page-shell";
import { PhotoHeader } from "@/app/ui/photo-header";
import { lockReason, tripHeaderPhoto } from "../helpers";
import { LoadErrorPage } from "../status-pages";
import { SwitchRow } from "../switch-row";
import { AnswersForm } from "./answers-form";
import { prefillFor, type Prefill } from "./answers";

type Loaded =
  | { kind: "error" }
  | { kind: "not_joined" }
  | {
      kind: "ok";
      trip: ParticipantTrip;
      name: string;
      prefill: Prefill;
      locked: string | null;
      chosen: TripView["chosen"];
    };

/** Everything that touches the database, so a failure becomes a friendly page, not a crash. */
async function load(tripId: string): Promise<Loaded> {
  try {
    const access = await requireParticipant(tripId, { needName: true });
    if (!access.ok || access.name === undefined) return { kind: "not_joined" };
    const { trip, name, deviceId } = access;
    // Only this person's own row is used, and prefillFor drops the budget unless it was
    // saved from this session: no one else's answers reach the page.
    const saved = (await getResponses(trip.id)).find((r) => r.name === name) ?? null;
    // "Decided: …" on every trip page once the organiser marks a final choice.
    const chosen = trip.finalDestinationId ? (await loadTripView(trip, new Date())).chosen : null;
    return {
      kind: "ok",
      trip,
      name,
      prefill: prefillFor(saved, deviceId),
      locked: lockReason(canSave(trip, new Date())),
      chosen,
    };
  } catch {
    return { kind: "error" };
  }
}

export default async function AnswersPage({ params }: PageProps<"/t/[tripId]/form">) {
  const { tripId } = await params;
  const loaded = await load(tripId);
  if (loaded.kind === "error") return <LoadErrorPage />;
  // Outside the try: redirect() works by throwing.
  if (loaded.kind === "not_joined") redirect(`/t/${encodeURIComponent(tripId)}`);

  const { trip, name, prefill, locked, chosen } = loaded;
  const photo = tripHeaderPhoto(trip);
  return (
    <Page header={<PhotoHeader photo={photo} title="Your answers" subtitle={trip.name} />} creditPhotos={[photo]}>
      <div className="flex flex-col gap-1">
        <SwitchRow tripId={trip.id} name={name} backToHome />
        <p className="text-sm leading-5 text-muted-fg">Answers lock {formatDeadlineIst(trip.deadline)}</p>
      </div>
      {chosen && <DecisionBanner destinationName={chosen.destinationName} windowLabel={chosen.windowLabel} />}
      <AnswersForm
        tripId={trip.id}
        name={name}
        windows={trip.windows.map((w) => ({ id: w.id, label: w.label }))}
        prefill={prefill}
        locked={locked}
      />
    </Page>
  );
}
