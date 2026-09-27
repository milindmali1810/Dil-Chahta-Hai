"use client";

import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { enterPin } from "@/app/actions";
import { PinField } from "@/app/ui/fields";
import { Notice } from "@/app/ui/notice";
import { SubmitButton } from "@/app/ui/submit-button";
import { UNREACHABLE } from "./helpers";

interface State {
  pin: string;
  error: string | null;
}

/** Step 1: enter the trip PIN. On success the server re-renders the next step. */
export function PinStep({ tripId, notice }: { tripId: string; notice?: string }) {
  const router = useRouter();
  const [state, formAction] = useActionState(
    async (_prev: State, formData: FormData): Promise<State> => {
      const pin = String(formData.get("pin") ?? "");
      const result = await enterPin(tripId, pin).catch(() => ({ ok: false as const, message: UNREACHABLE }));
      if (!result.ok) return { pin, error: result.message };
      router.refresh();
      return { pin, error: null };
    },
    { pin: "", error: null },
  );

  return (
    <section className="flex flex-col gap-4" aria-labelledby="pin-heading">
      <h2 id="pin-heading" className="font-display text-xl leading-7 font-medium">
        Enter the trip PIN
      </h2>
      {notice && <Notice tone="warning">{notice}</Notice>}
      <form action={formAction} className="flex flex-col gap-4">
        {/* The value survives the form reset React does after each submit, so a typo can be fixed. */}
        <PinField required defaultValue={state.pin} error={state.error} />
        <SubmitButton pendingLabel="Checking…">Continue</SubmitButton>
      </form>
    </section>
  );
}
