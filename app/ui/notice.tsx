import type { ReactNode, Ref } from "react";
import { AlertTriangle, Check, Info } from "./icons";

export type NoticeTone = "info" | "success" | "warning" | "error";

const TONES: Record<NoticeTone, { box: string; icon: string; Icon: typeof Info }> = {
  info: { box: "bg-decision-soft text-decision-fg", icon: "text-decision", Icon: Info },
  success: { box: "bg-success-soft text-success-fg", icon: "text-success", Icon: Check },
  warning: { box: "bg-warning-soft text-warning-fg", icon: "text-warning", Icon: AlertTriangle },
  error: { box: "bg-error-soft text-error", icon: "text-error", Icon: AlertTriangle },
};

export interface NoticeProps {
  tone: NoticeTone;
  /** Optional bold first line. */
  title?: ReactNode;
  children?: ReactNode;
  /** Errors are role="alert" by default; everything else role="status". */
  role?: "status" | "alert";
  id?: string;
  /** For an error summary that receives focus after a failed submit. */
  ref?: Ref<HTMLDivElement>;
  tabIndex?: number;
  className?: string;
}

/** Soft-tinted box with an icon and text. Colour is never the only signal. */
export function Notice({ tone, title, children, role, id, ref, tabIndex, className }: NoticeProps) {
  const t = TONES[tone];
  return (
    <div
      id={id}
      ref={ref}
      tabIndex={tabIndex}
      role={role ?? (tone === "error" ? "alert" : "status")}
      className={`flex items-start gap-3 rounded-control p-4 text-base leading-6 ${t.box} ${className ?? ""}`}
    >
      <t.Icon size={20} className={`mt-0.5 shrink-0 ${t.icon}`} />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {title && <p className="font-bold">{title}</p>}
        {children}
      </div>
    </div>
  );
}
