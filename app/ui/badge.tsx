import type { ReactNode } from "react";
import { AlertTriangle, Check, Clock, Info, Lock, MapPin, Plane } from "./icons";

export type BadgeTone =
  | "success"
  | "warning"
  | "flagged"
  | "neutral"
  | "locked"
  | "provisional"
  | "domestic"
  | "international"
  | "chosen";

const TONES: Record<BadgeTone, { cls: string; Icon: typeof Info; word?: string }> = {
  success: { cls: "bg-success-soft text-success-fg", Icon: Check, word: "Submitted" },
  warning: { cls: "bg-warning-soft text-warning-fg", Icon: Clock, word: "Pending" },
  flagged: { cls: "bg-warning-soft text-warning-fg", Icon: AlertTriangle, word: "Flagged" },
  neutral: { cls: "bg-bg text-muted-fg border border-border", Icon: Info },
  locked: { cls: "bg-card text-fg border border-input-border", Icon: Lock, word: "Results (locked)" },
  provisional: { cls: "bg-warning-soft text-warning-fg", Icon: Clock, word: "Provisional" },
  domestic: { cls: "bg-primary-soft text-primary-pressed", Icon: MapPin, word: "Domestic" },
  international: { cls: "bg-decision-soft text-decision-fg", Icon: Plane, word: "International" },
  chosen: { cls: "bg-decision text-white", Icon: Check, word: "Chosen" },
};

export interface BadgeProps {
  tone: BadgeTone;
  /** The word. Each tone has a default (e.g. success → "Submitted"); neutral needs one. */
  children?: ReactNode;
  className?: string;
}

/** Pill with an icon and a word, 14px Nunito 700. Never colour alone. */
export function Badge({ tone, children, className }: BadgeProps) {
  const t = TONES[tone];
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 rounded-full px-2.5 py-0.5 text-sm leading-5 font-bold ${t.cls} ${className ?? ""}`}
    >
      <t.Icon size={16} className="shrink-0" />
      <span>{children ?? t.word}</span>
    </span>
  );
}
