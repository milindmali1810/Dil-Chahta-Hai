"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { confirmName, pickName } from "@/app/actions";
import { ChoiceGroup } from "@/app/ui/choice";
import { ConfirmDialog } from "@/app/ui/confirm-dialog";
import { Notice } from "@/app/ui/notice";
import { SubmitButton } from "@/app/ui/submit-button";
import { lostAccess, UNREACHABLE } from "./helpers";

interface State {
  name: string;
  error: string | null;
  /** "Is this really you?" message from pickName, when it asks. */
  confirm: string | null;
}

/** Step 2: "Who are you?". Asks first if that name's answers came from another session. */
export function NameStep({ tripId, names }: { tripId: string; names: string[] }) {
  const router = useRouter();
  const [state, formAction] = useActionState(
    async (_prev: State, formData: FormData): Promise<State> => {
      const name = String(formData.get("name") ?? "");
      const result = await pickName(tripId, name).catch(() => ({ ok: false as const, message: UNREACHABLE }));
      if (!result.ok) {
        if (lostAccess(result.message)) router.refresh();
        return { name, error: result.message, confirm: null };
      }
      if (result.needsConfirm) return { name, error: null, confirm: result.message };
      router.refresh();
      return { name, error: null, confirm: null };
    },
    { name: "", error: null, confirm: null },
  );
  // The dialog belongs to one pickName answer; "No" (or a failed confirm) closes it for that answer only.
  const [closedFor, setClosedFor] = useState<State | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirming, startConfirm] = useTransition();

  const dialogOpen = state.confirm !== null && closedFor !== state;
  const error = dialogOpen ? null : (confirmError ?? state.error);

  function onConfirm() {
    startConfirm(async () => {
      const result = await confirmName(tripId, state.name).catch(() => ({ ok: false as const, message: UNREACHABLE }));
      if (result.ok) {
        router.refresh();
        return;
      }
      if (lostAccess(result.message)) router.refresh();
      setConfirmError(result.message);
      setClosedFor(state);
    });
  }

  return (
    <section className="flex flex-col gap-4">
      <form
        action={formAction}
        onSubmit={() => setConfirmError(null)}
        className="flex flex-col gap-4"
      >
        <ChoiceGroup
          type="radio"
          name="name"
          legend="Who are you?"
          options={names.map((n) => ({ value: n, label: n }))}
          defaultValue={state.name || undefined}
          required
        />
        {error && <Notice tone="error">{error}</Notice>}
        <SubmitButton pendingLabel="Checking…">Continue</SubmitButton>
      </form>
      <ConfirmDialog
        open={dialogOpen}
        message={state.confirm}
        confirmLabel="Yes, it's me"
        cancelLabel="No"
        pending={confirming}
        pendingLabel="Checking…"
        onConfirm={onConfirm}
        onCancel={() => setClosedFor(state)}
      />
    </section>
  );
}
