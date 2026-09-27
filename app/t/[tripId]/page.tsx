// Trip home (/t/[tripId]). The server picks the step from the join cookie:
// no cookie (or an old PIN) → PIN; no name → name picker; otherwise → home.

import { destinationPhoto, type Photo } from "@/lib/photos";
import { requireParticipant, type ParticipantTrip } from "@/lib/server/access";
import { formatDeadlineIst, getTrip } from "@/lib/server/data";
import { loadTripView, type TripView } from "@/lib/server/trip-view";
import { Badge } from "@/app/ui/badge";
import { ButtonLink } from "@/app/ui/button";
import { DecisionBanner } from "@/app/ui/decision-banner";
import { Notice } from "@/app/ui/notice";
import { Page } from "@/app/ui/page-shell";
import { PhotoHeader } from "@/app/ui/photo-header";
import { ResultsList } from "@/app/ui/results";
import { StatusList } from "@/app/ui/status-list";
import { lockReason, PIN_CHANGED, tripHeaderPhoto } from "./helpers";
import { NameStep } from "./name-step";
import { PinStep } from "./pin-step";
import { InvalidLinkPage, LoadErrorPage } from "./status-pages";
import { SwitchRow } from "./switch-row";

type Step =
  | { kind: "error" }
  | { kind: "no_trip" }
  | { kind: "pin"; tripId: string; tripName: string; pinChanged: boolean }
  | { kind: "name"; trip: ParticipantTrip }
  | { kind: "home"; trip: ParticipantTrip; name: string; view: TripView };

/** Everything that touches the database, so a failure becomes a friendly page, not a crash. */
async function loadStep(tripId: string): Promise<Step> {
  try {
    const access = await requireParticipant(tripId, { needName: false });
    if (!access.ok) {
      if (access.reason === "no_trip") return { kind: "no_trip" };
      // Before the PIN only the trip's name is shown; nothing else from the row is kept.
      const tripName = (await getTrip(tripId))?.name;
      if (tripName === undefined) return { kind: "no_trip" };
      return { kind: "pin", tripId, tripName, pinChanged: access.reason === "pin_changed" };
    }
    if (access.name === undefined) return { kind: "name", trip: access.trip };
    const view = await loadTripView(access.trip, new Date());
    return { kind: "home", trip: access.trip, name: access.name, view };
  } catch {
    return { kind: "error" };
  }
}

export default async function TripPage({ params }: PageProps<"/t/[tripId]">) {
  const { tripId } = await params;
  const step = await loadStep(tripId);

  switch (step.kind) {
    case "error":
      return <LoadErrorPage />;
    case "no_trip":
      return <InvalidLinkPage />;
    case "pin": {
      const photo = tripHeaderPhoto({ id: step.tripId, finalDestinationId: null, finalWindowId: null });
      return (
        <Page header={<PhotoHeader photo={photo} title={step.tripName} />} creditPhotos={[photo]}>
          <PinStep tripId={step.tripId} notice={step.pinChanged ? PIN_CHANGED : undefined} />
        </Page>
      );
    }
    case "name": {
      const photo = tripHeaderPhoto(step.trip);
      return (
        <Page header={<PhotoHeader photo={photo} title={step.trip.name} />} creditPhotos={[photo]}>
          <NameStep tripId={step.trip.id} names={step.trip.participantNames} />
        </Page>
      );
    }
    case "home":
      return <Home trip={step.trip} name={step.name} view={step.view} />;
  }
}

function Home({ trip, name, view }: { trip: ParticipantTrip; name: string; view: TripView }) {
  const locked = lockReason(view.saveCheck);
  const cardPhotos = view.results.shown
    .map((o) => destinationPhoto(o.destinationId))
    .filter((p): p is Photo => p !== null);
  const resultsLocked = !view.saveCheck.ok;

  return (
    <Page
      header={
        <PhotoHeader
          photo={view.headerPhoto}
          title={trip.name}
          subtitle={`Answers lock ${formatDeadlineIst(trip.deadline)}`}
        />
      }
      creditPhotos={[view.headerPhoto, ...cardPhotos]}
    >
      <div className="flex flex-col gap-4">
        <SwitchRow tripId={trip.id} name={name} />
        {view.chosen && (
          <DecisionBanner destinationName={view.chosen.destinationName} windowLabel={view.chosen.windowLabel} />
        )}
        {locked === null ? (
          <ButtonLink href={`/t/${encodeURIComponent(trip.id)}/form`}>Add / edit my answers</ButtonLink>
        ) : (
          <Notice tone="info">{locked}</Notice>
        )}
      </div>

      <section className="flex flex-col gap-4" aria-labelledby="status-heading">
        <h2 id="status-heading" className="font-display text-xl leading-7 font-medium">
          Who has answered
        </h2>
        <StatusList rows={view.statusRows} />
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="results-heading">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h2 id="results-heading" className="font-display text-xl leading-7 font-medium">
            Results
          </h2>
          {resultsLocked ? <Badge tone="locked" /> : <Badge tone="provisional">{view.resultsLabel}</Badge>}
        </div>
        <ResultsList results={view.results} destinations={view.destinationMeta} chosen={view.chosen} />
      </section>
    </Page>
  );
}
