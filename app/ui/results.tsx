import Image from "next/image";
import type { ReactNode } from "react";
import { destinationPhoto } from "@/lib/photos";
import type { ResultsOutput, ShownOption } from "@/lib/scoring";
import { Badge } from "./badge";
import { formatInr } from "./format";
import { AlertTriangle, Check } from "./icons";
import { Notice } from "./notice";

const CARD_SIZES = "(max-width: 480px) 100vw, 480px";

export interface ResultCardProps {
  option: ShownOption;
  /** 1-based position, shown as the "Option N" chip. */
  position: number;
  /** From the destination's `international` tag. */
  international: boolean;
  /** This option is the organiser's final choice. */
  chosen?: boolean;
  /** Slot under the card body, e.g. the organiser's "Mark as final" button. */
  action?: ReactNode;
}

/**
 * One shown option: lazy 112px photo, Option chip + Domestic/International badge,
 * destination, "window · ₹X per person", why-line, group average, then one row per person.
 * States: passing (green ✓ why-line), flagged (warning-soft card, ⚠ problem line),
 * chosen (2px sea-blue border + Chosen badge).
 */
export function ResultCard({ option, position, international, chosen = false, action }: ResultCardProps) {
  const photo = destinationPhoto(option.destinationId);
  const flagged = !option.passes;
  const frame = chosen
    ? "border-2 border-decision"
    : flagged
      ? "border border-warning/40"
      : "border border-border";
  return (
    <article
      className={`overflow-hidden rounded-card shadow-card ${flagged ? "bg-warning-soft" : "bg-card"} ${frame}`}
      aria-label={`Option ${position}: ${option.destinationName}, ${option.windowLabel}`}
    >
      <div className="relative h-28 w-full bg-primary-soft">
        <Image src={photo.src} alt={photo.place} fill loading="lazy" sizes={CARD_SIZES} className="object-cover" />
      </div>
      <div className="flex flex-col gap-3 p-4 min-[400px]:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-fg px-2.5 py-0.5 text-sm leading-5 font-bold text-white">
            Option {position}
          </span>
          <Badge tone={international ? "international" : "domestic"} />
          {chosen && <Badge tone="chosen" />}
          {flagged && <Badge tone="flagged" />}
        </div>
        <div>
          <h3 className="font-display text-[22px] leading-7 font-semibold">{option.destinationName}</h3>
          <p className="text-base leading-6 font-bold tabular-nums">
            {option.windowLabel} · {formatInr(option.costPerPersonInr)} per person
          </p>
        </div>
        <p
          className={`flex items-start gap-2 text-base leading-6 font-semibold ${
            flagged ? "text-warning-fg" : "text-success-fg"
          }`}
        >
          {flagged ? (
            <AlertTriangle size={20} className="mt-0.5 shrink-0 text-warning" />
          ) : (
            <Check size={20} className="mt-0.5 shrink-0 text-success" />
          )}
          <span>{option.whyLine}</span>
        </p>
        <p className="text-sm leading-5 text-muted-fg">
          Group average{" "}
          <span className="text-base leading-6 font-bold text-fg tabular-nums">{option.groupAverage}</span>
        </p>
        <ul className="flex flex-col divide-y divide-border border-t border-border">
          {option.people.map((p) => (
            <li key={p.name} className="flex flex-col py-2">
              <span className="flex items-baseline justify-between gap-3">
                <span className="font-bold">{p.name}</span>
                <span className="font-bold tabular-nums">
                  {p.score === null ? (
                    <span className="inline-flex items-center gap-1 text-sm text-warning-fg">
                      <AlertTriangle size={16} />
                      Blocked
                    </span>
                  ) : (
                    p.score
                  )}
                </span>
              </span>
              <span className="text-sm leading-5 text-muted-fg">{p.reason}</span>
            </li>
          ))}
        </ul>
        {action}
      </div>
    </article>
  );
}

export interface ResultsListProps {
  results: ResultsOutput;
  /** Destination id → whether it's international (from its `international` tag). */
  destinations: Record<string, { international: boolean }>;
  /** The final choice, if one is set. */
  chosen?: { destinationId: string; windowId: string } | null;
  /** Per-card action slot, e.g. the organiser's "Mark as final". */
  renderAction?: (option: ShownOption) => ReactNode;
}

/**
 * The results area: the "Based on N of M" label, then either a Notice (not enough answers,
 * or no destinations yet) or the shown cards. Never blank.
 */
export function ResultsList({ results, destinations, chosen, renderAction }: ResultsListProps) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm leading-5 text-muted-fg">{results.label}</p>
      {results.status === "not_enough" ? (
        <Notice tone="info">Results appear once 2 people have answered.</Notice>
      ) : results.shown.length === 0 ? (
        <Notice tone="info">No destinations have been added yet.</Notice>
      ) : (
        <ol className="flex flex-col gap-4">
          {results.shown.map((o, i) => (
            <li key={`${o.destinationId}:${o.windowId}`}>
              <ResultCard
                option={o}
                position={i + 1}
                international={destinations[o.destinationId]?.international ?? false}
                chosen={chosen?.destinationId === o.destinationId && chosen?.windowId === o.windowId}
                action={renderAction?.(o)}
              />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
