"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button, type ButtonVariant } from "./button";
import { Loader } from "./icons";

export interface ConfirmDialogProps {
  open: boolean;
  /** The question, e.g. "Lock now? Friends can't edit until you unlock." */
  message: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** Match the action: "decision" for Mark as final, "danger-outline" for Lock now. */
  confirmVariant?: ButtonVariant;
  onConfirm: () => void;
  /** Called on Cancel, Escape, or a click on the backdrop. */
  onCancel: () => void;
  /** While the confirmed action runs: spinner + this label, both buttons disabled. */
  pendingLabel?: string;
  pending?: boolean;
}

/**
 * A native modal <dialog> (focus trap, Escape and inert page for free). Controlled by
 * `open`. The confirm button comes first, so showModal() focuses it.
 */
export function ConfirmDialog({
  open,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  confirmVariant = "primary",
  onConfirm,
  onCancel,
  pendingLabel,
  pending = false,
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const messageId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={messageId}
      // Escape fires "cancel": keep React state in charge of closing.
      onCancel={(e) => {
        e.preventDefault();
        if (!pending) onCancel();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onCancel();
      }}
      className="m-auto w-[calc(100%-32px)] max-w-[400px] rounded-card border border-border bg-card p-0 text-fg shadow-card backdrop:bg-fg/50"
    >
      <div className="flex flex-col gap-4 p-5">
        <p id={messageId} className="font-display text-xl leading-7 font-medium">
          {message}
        </p>
        <div className="flex flex-col gap-2">
          <Button variant={confirmVariant} onClick={onConfirm} disabled={pending}>
            {pending ? (
              <>
                <Loader />
                <span>{pendingLabel ?? confirmLabel}</span>
              </>
            ) : (
              confirmLabel
            )}
          </Button>
          <Button variant="secondary" onClick={onCancel} disabled={pending}>
            {cancelLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
