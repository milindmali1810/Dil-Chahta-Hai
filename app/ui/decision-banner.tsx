import type { ReactNode } from "react";
import { MapPin } from "./icons";

export interface DecisionBannerProps {
  destinationName: string;
  windowLabel: string;
  /** Optional slot, e.g. the organiser's "Clear final choice" quiet button. */
  children?: ReactNode;
}

/** "Decided: Goa, 12–16 Dec". Only render it when a final choice is set. */
export function DecisionBanner({ destinationName, windowLabel, children }: DecisionBannerProps) {
  return (
    <section
      aria-label="Final decision"
      className="flex flex-col gap-2 rounded-card border-2 border-decision bg-decision-soft p-4 text-decision-fg"
    >
      <p className="flex items-center gap-2 font-display text-xl leading-7 font-semibold">
        <MapPin size={24} className="shrink-0 text-decision" />
        <span>
          Decided: {destinationName}, {windowLabel}
        </span>
      </p>
      {children}
    </section>
  );
}
