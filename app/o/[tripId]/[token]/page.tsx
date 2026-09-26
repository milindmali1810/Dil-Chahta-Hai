// Organiser page (/o/[tripId]/[token]): share, who has answered, results with
// "Mark as final", and trip controls. The token in this URL is the only proof of
// being the organiser; every action re-checks it on the server.

import type { Metadata } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { destinationPhoto, type Photo } from "@/lib/photos";
import { requireOrganiser } from "@/lib/server/access";
import { formatDeadlineIst, type Trip } from "@/lib/server/data";
import { loadTripView, type TripView } from "@/lib/server/trip-view";
import { Badge } from "@/app/ui/badge";
import { CopyField } from "@/app/ui/copy-field";
import { Notice } from "@/app/ui/notice";
import { Page } from "@/app/ui/page-shell";
import { PhotoHeader } from "@/app/ui/photo-header";
import { ResultsList } from "@/app/ui/results";
import { SaveThisLink } from "@/app/ui/save-this-link";
import { StatusList } from "@/app/ui/status-list";
import {
  canLockNow,
  canUnlockNow,
  editingStatus,
  isJustRegenerated,
  organiserPath,
  requestOrigin,
  tripLink,
} from "./helpers";
import { FinalDecision, MarkFinalButton, TripControls } from "./organiser-controls";

export const metadata: Metadata = { title: "Organiser · Dil Chahta Hai" };

type Loaded =
  | { kind: "ok"; trip: Trip; view: TripView }
  | { kind: "invalid" }
  | { kind: "error" };

async function load(tripId: string, token: string, now: Date): Promise<Loaded> {
  try {
    const access = await requireOrganiser(tripId, token);
    if (!access.ok) return { kind: "invalid" };
    return { kind: "ok", trip: access.trip, view: await loadTripView(access.trip, now) };
  } catch {
    // e.g. no database configured, or Supabase unreachable / paused.
    return { kind: "error" };
  }
}

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-xl leading-7 font-medium">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** Whole-page message for a bad link or a failed load (no photo, just the sunset stripe). */
function Message({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Page>
      <h1 className="pt-8 font-display text-3xl leading-9 font-semibold">{title}</h1>
      {children}
    </Page>
  );
}

export default async function OrganiserPage(props: PageProps<"/o/[tripId]/[token]">) {
  const { tripId, token } = await props.params;
  const { new: justRegenerated } = await props.searchParams;
  const origin = requestOrigin(await headers());
  const now = new Date();

  const loaded = await load(tripId, token, now);

  if (loaded.kind === "invalid") {
    return (
      <Message title="This organiser link isn't valid.">
        <p className="text-base leading-6 text-muted-fg">
          It may have been replaced when the PIN was regenerated. Use the newest organiser link you saved.
        </p>
      </Message>
    );
  }

  if (loaded.kind === "error") {
    return (
      <Message title="Organiser">
        <Notice tone="error">Couldn&apos;t load the trip. Check your connection and try again.</Notice>
      </Message>
    );
  }

  const { trip, view } = loaded;
  const ids = { tripId: trip.id, token };
  const cardPhotos =
    view.results.status === "not_enough"
      ? []
      : view.results.shown.map((o) => destinationPhoto(o.destinationId)).filter((p): p is Photo => p !== null);

  return (
    <Page
      header={
        <PhotoHeader
          photo={view.headerPhoto}
          title={
            <>
              <span className="block font-sans text-sm leading-5 font-bold tracking-wide uppercase">Organiser</span>
              {trip.name}
            </>
          }
          subtitle={`Answers lock ${formatDeadlineIst(trip.deadline)}`}
        />
      }
      creditPhotos={[view.headerPhoto, ...cardPhotos]}
    >
      {isJustRegenerated(justRegenerated) && (
        <SaveThisLink organiserUrl={`${origin}${organiserPath(trip.id, token)}`} pin={trip.pin} />
      )}

      <FinalDecision {...ids} chosen={view.chosen} />

      <Section title="Share">
        <p className="-mt-2 text-sm leading-5 text-muted-fg">Send both to the group.</p>
        <CopyField label="Trip link" value={tripLink(origin, trip.id)} />
        <CopyField label="PIN" value={trip.pin} large />
      </Section>

      <Section title="Who has answered">
        <StatusList rows={view.statusRows} />
      </Section>

      <Section
        title="Results"
        aside={
          view.saveCheck.ok ? <Badge tone="provisional">{view.resultsLabel}</Badge> : <Badge tone="locked" />
        }
      >
        <ResultsList
          results={view.results}
          destinations={view.destinationMeta}
          chosen={view.chosen}
          renderAction={(o) => (
            <MarkFinalButton
              {...ids}
              destinationId={o.destinationId}
              windowId={o.windowId}
              destinationName={o.destinationName}
              windowLabel={o.windowLabel}
              chosen={view.chosen?.destinationId === o.destinationId && view.chosen?.windowId === o.windowId}
            />
          )}
        />
      </Section>

      <Section title="Trip controls">
        <p className="-mt-2 text-base leading-6 text-muted-fg">{editingStatus(view.saveCheck)}</p>
        <TripControls
          {...ids}
          origin={origin}
          showLock={canLockNow(trip, now)}
          showUnlock={canUnlockNow(trip, now)}
        />
      </Section>
    </Page>
  );
}
