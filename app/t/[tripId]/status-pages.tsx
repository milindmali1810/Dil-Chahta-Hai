import { Notice } from "@/app/ui/notice";
import { Page } from "@/app/ui/page-shell";
import { LOAD_ERROR, NO_TRIP } from "./helpers";

/** Whole-page message for a trip ID that doesn't exist. */
export function InvalidLinkPage() {
  return (
    <Page>
      <h1 className="font-display text-3xl leading-9 font-semibold">{NO_TRIP}</h1>
      <p className="-mt-4 text-base leading-6 text-muted-fg">
        Check the link in your group chat, or ask the organiser to share it again.
      </p>
    </Page>
  );
}

/** Shown instead of crashing when the trip can't be loaded (e.g. the database is unreachable). */
export function LoadErrorPage() {
  return (
    <Page>
      <h1 className="font-display text-3xl leading-9 font-semibold">Dil Chahta Hai</h1>
      <Notice tone="error">{LOAD_ERROR}</Notice>
    </Page>
  );
}
