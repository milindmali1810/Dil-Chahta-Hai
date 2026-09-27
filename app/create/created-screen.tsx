"use client";

import { ButtonLink } from "@/app/ui/button";
import { CopyField } from "@/app/ui/copy-field";
import { Notice } from "@/app/ui/notice";
import { SaveThisLink } from "@/app/ui/save-this-link";

export interface CreatedTrip {
  tripId: string;
  pin: string;
  organiserToken: string;
}

/**
 * Shown on `/` right after a successful createTrip: the trip link and PIN to share, and
 * the private organiser link. Only rendered in the browser (after the action), so
 * `window.location.origin` is available.
 */
export function CreatedScreen({ tripId, pin, organiserToken }: CreatedTrip) {
  const origin = window.location.origin;
  const tripPath = `/t/${tripId}`;
  const organiserPath = `/o/${tripId}/${organiserToken}`;
  return (
    <>
      {/* The fields sit outside the Notice so the 28px PIN fits beside Copy at 320px. */}
      <div className="flex flex-col gap-4">
        <Notice tone="info">
          <p className="font-bold">Share these two in your WhatsApp group:</p>
        </Notice>
        <CopyField label="Trip link" value={`${origin}${tripPath}`} />
        <CopyField label="PIN" value={pin} large />
      </div>
      <SaveThisLink organiserUrl={`${origin}${organiserPath}`} />
      <div className="flex flex-col gap-2">
        <ButtonLink href={tripPath} variant="secondary">
          Open the trip
        </ButtonLink>
        <ButtonLink href={organiserPath} variant="quiet">
          Open organiser page
        </ButtonLink>
      </div>
    </>
  );
}
