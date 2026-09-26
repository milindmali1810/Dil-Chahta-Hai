"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "./button";
import { Check, Copy } from "./icons";

export interface CopyFieldProps {
  label: string;
  value: string;
  /** Big 28px tabular digits, for the PIN. */
  large?: boolean;
  /** Defaults to a slug of the label. */
  id?: string;
}

type Status = "idle" | "copied" | "selected";

const SELECTED = "Selected. Copy it from the box above.";

/**
 * Label, the value in a cream box, and a Copy button. Uses the Clipboard API; if that
 * isn't available (or is refused), selects the text so it can be copied by hand.
 * "✓ Copied" shows for 2s and is announced politely.
 */
export function CopyField({ label, value, large = false, id }: CopyFieldProps) {
  const fieldId = id ?? `copy-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>("idle");

  useEffect(() => {
    if (status !== "copied") return;
    const timer = setTimeout(() => setStatus("idle"), 2000);
    return () => clearTimeout(timer);
  }, [status]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setStatus("copied");
    } catch {
      inputRef.current?.select();
      setStatus("selected");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={fieldId} className="text-base leading-6 font-bold text-fg">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          ref={inputRef}
          id={fieldId}
          type="text"
          readOnly
          value={value}
          onFocus={(e) => e.currentTarget.select()}
          className={`min-h-12 w-full min-w-0 flex-1 rounded-control border border-border bg-bg px-4 py-3 text-fg ${
            large ? "text-[28px] leading-9 font-bold tabular-nums tracking-[0.2em]" : "text-base leading-6"
          }`}
        />
        <Button variant="secondary" fullWidth={false} onClick={copy} className="shrink-0 px-4">
          {status === "copied" ? <Check /> : <Copy />}
          <span>{status === "copied" ? "Copied" : "Copy"}</span>
        </Button>
      </div>
      {status === "selected" && (
        <p aria-hidden="true" className="text-sm leading-5 text-muted-fg">
          {SELECTED}
        </p>
      )}
      <p aria-live="polite" className="sr-only">
        {status === "copied" ? `${label} copied` : status === "selected" ? SELECTED : ""}
      </p>
    </div>
  );
}
