"use client";

// The organiser's buttons. Each one calls a server action from app/actions.ts (which
// checks the organiser token itself), shows a pending state while it runs, then a
// success or error Notice, and refreshes the page. Never imports lib/server/*.

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { clearFinalAction, lockEarly, markFinal, regeneratePinAction, unlock } from "@/app/actions";
import { Button } from "@/app/ui/button";
import { ConfirmDialog } from "@/app/ui/confirm-dialog";
import { DecisionBanner } from "@/app/ui/decision-banner";
import { Check, Loader, Lock, X } from "@/app/ui/icons";
import { Notice } from "@/app/ui/notice";
import { SaveThisLink } from "@/app/ui/save-this-link";
import { markFinalQuestion, organiserPath } from "./helpers";
import { LockOpen, RefreshCw } from "./icons";

type Fail = { ok: false; message: string };
type Feedback = { tone: "success" | "error"; text: string };

const UNREACHABLE = "Couldn't reach the server. Check your connection and try again.";

interface RunOptions<T> {
  /** Success message, or null for none. */
  success: (result: T) => string | null;
  /** Where to go on success instead of refreshing the current URL. */
  navigateTo?: (result: T) => string;
  /** Runs once the action has finished, either way (e.g. close the dialog). */
  settled?: () => void;
}

/** Runs one organiser action with a pending state, a result Notice and a refresh. */
function useOrganiserAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  function run<T extends { ok: true }>(call: () => Promise<T | Fail>, opts: RunOptions<T>) {
    setFeedback(null);
    startTransition(async () => {
      let result: T | Fail;
      try {
        result = await call();
      } catch {
        result = { ok: false, message: UNREACHABLE };
      }
      startTransition(() => {
        opts.settled?.();
        if (result.ok) {
          const text = opts.success(result);
          setFeedback(text ? { tone: "success", text } : null);
          if (opts.navigateTo) {
            router.replace(opts.navigateTo(result));
            return;
          }
        } else {
          setFeedback({ tone: "error", text: result.message });
        }
        router.refresh();
      });
    });
  }

  return { pending, feedback, run };
}

function FeedbackNotice({ feedback }: { feedback: Feedback | null }) {
  if (!feedback) return null;
  return (
    <Notice tone={feedback.tone} role={feedback.tone === "error" ? "alert" : "status"}>
      {feedback.text}
    </Notice>
  );
}

function PendingLabel({ pending, label, pendingLabel, icon }: {
  pending: boolean;
  label: string;
  pendingLabel: string;
  icon: ReactNode;
}) {
  return (
    <>
      {pending ? <Loader /> : icon}
      <span>{pending ? pendingLabel : label}</span>
    </>
  );
}

interface OrganiserIds {
  tripId: string;
  token: string;
}

// ---------------------------------------------------------------------------
// Decided banner with "Clear final choice". Always mounted, so the result of
// clearing stays on screen after the banner itself goes away.
// ---------------------------------------------------------------------------

export function FinalDecision({
  tripId,
  token,
  chosen,
}: OrganiserIds & { chosen: { destinationName: string; windowLabel: string } | null }) {
  const [open, setOpen] = useState(false);
  const { pending, feedback, run } = useOrganiserAction();

  if (!chosen && !feedback) return null;

  return (
    <div className="flex flex-col gap-3">
      {chosen && (
        <DecisionBanner destinationName={chosen.destinationName} windowLabel={chosen.windowLabel}>
          <Button variant="quiet" fullWidth={false} className="self-start px-0" onClick={() => setOpen(true)} disabled={pending}>
            <X />
            <span>Clear final choice</span>
          </Button>
        </DecisionBanner>
      )}
      <FeedbackNotice feedback={feedback} />
      <ConfirmDialog
        open={open}
        message="Clear the final choice? Friends can edit again, unless you've locked the trip or the deadline has passed."
        confirmLabel="Clear final choice"
        pendingLabel="Clearing…"
        pending={pending}
        onCancel={() => setOpen(false)}
        onConfirm={() =>
          run(() => clearFinalAction(tripId, token), {
            success: () => "Final choice cleared.",
            settled: () => setOpen(false),
          })
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// "Mark as final" on each result card. Also mounted on the chosen card (with the
// button hidden), so the success message survives the refresh.
// ---------------------------------------------------------------------------

export function MarkFinalButton({
  tripId,
  token,
  destinationId,
  windowId,
  destinationName,
  windowLabel,
  chosen,
}: OrganiserIds & {
  destinationId: string;
  windowId: string;
  destinationName: string;
  windowLabel: string;
  chosen: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { pending, feedback, run } = useOrganiserAction();

  if (chosen && !feedback) return null;

  return (
    <div className="flex flex-col gap-3">
      {!chosen && (
        <Button variant="decision" onClick={() => setOpen(true)} disabled={pending}>
          <PendingLabel pending={pending} label="Mark as final" pendingLabel="Marking…" icon={<Check />} />
        </Button>
      )}
      <FeedbackNotice feedback={feedback} />
      <ConfirmDialog
        open={open}
        message={markFinalQuestion(destinationName, windowLabel)}
        confirmLabel="Mark as final"
        confirmVariant="decision"
        pendingLabel="Marking…"
        pending={pending}
        onCancel={() => setOpen(false)}
        onConfirm={() =>
          run(() => markFinal(tripId, token, destinationId, windowId), {
            success: () => `Marked as final. Everyone now sees "Decided: ${destinationName}, ${windowLabel}".`,
            settled: () => setOpen(false),
          })
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trip controls: Lock now, Unlock, Regenerate PIN.
// ---------------------------------------------------------------------------

type Busy = "lock" | "unlock" | "regenerate" | null;

export function TripControls({
  tripId,
  token,
  origin,
  showLock,
  showUnlock,
}: OrganiserIds & { origin: string; showLock: boolean; showUnlock: boolean }) {
  const [dialog, setDialog] = useState<"lock" | "regenerate" | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [fresh, setFresh] = useState<{ pin: string; organiserToken: string } | null>(null);
  const { pending, feedback, run } = useOrganiserAction();
  const isBusy = (b: Busy) => pending && busy === b;

  function settled() {
    setDialog(null);
    setBusy(null);
  }

  return (
    <div className="flex flex-col gap-3">
      {showLock && (
        <Button variant="danger-outline" onClick={() => setDialog("lock")} disabled={pending}>
          <PendingLabel pending={isBusy("lock")} label="Lock now" pendingLabel="Locking…" icon={<Lock />} />
        </Button>
      )}
      {showUnlock && (
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() => {
            setBusy("unlock");
            run(() => unlock(tripId, token), { success: () => "Unlocked. Friends can edit again.", settled });
          }}
        >
          <PendingLabel pending={isBusy("unlock")} label="Unlock" pendingLabel="Unlocking…" icon={<LockOpen />} />
        </Button>
      )}
      <Button variant="secondary" onClick={() => setDialog("regenerate")} disabled={pending}>
        <PendingLabel
          pending={isBusy("regenerate")}
          label="Regenerate PIN"
          pendingLabel="Making a new PIN…"
          icon={<RefreshCw />}
        />
      </Button>

      <FeedbackNotice feedback={feedback} />
      {fresh && (
        <SaveThisLink
          organiserUrl={`${origin}${organiserPath(tripId, fresh.organiserToken)}`}
          pin={fresh.pin}
        />
      )}

      <ConfirmDialog
        open={dialog === "lock"}
        message="Lock now? Friends can't edit until you unlock."
        confirmLabel="Lock now"
        confirmVariant="danger-outline"
        pendingLabel="Locking…"
        pending={isBusy("lock")}
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          setBusy("lock");
          run(() => lockEarly(tripId, token), {
            success: () => "Locked. Friends can't edit until you unlock.",
            settled,
          });
        }}
      />
      <ConfirmDialog
        open={dialog === "regenerate"}
        message="Make a new PIN and a new organiser link? The old ones stop working."
        confirmLabel="Make a new PIN"
        pendingLabel="Making a new PIN…"
        pending={isBusy("regenerate")}
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          setBusy("regenerate");
          run(() => regeneratePinAction(tripId, token), {
            success: (r) => {
              setFresh({ pin: r.pin, organiserToken: r.organiserToken });
              return null;
            },
            // The old organiser link no longer works: move to the new one, which
            // shows "Save this link" at the top because of ?new=1.
            navigateTo: (r) => organiserPath(tripId, r.organiserToken, true),
            settled,
          });
        }}
      />
    </div>
  );
}
