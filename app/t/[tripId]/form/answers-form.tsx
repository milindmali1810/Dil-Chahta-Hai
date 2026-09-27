"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef } from "react";
import { saveResponse } from "@/app/actions";
import { ChoiceGroup } from "@/app/ui/choice";
import { BudgetField } from "@/app/ui/fields";
import { Notice } from "@/app/ui/notice";
import { SubmitButton } from "@/app/ui/submit-button";
import { REFERENCE_CITY } from "@/lib/trip-config";
import { lostAccess, UNREACHABLE } from "../helpers";
import {
  BUDGET_ERROR,
  DEALBREAKER_OPTIONS,
  parseBudget,
  readAnswers,
  TRIP_TYPE_OPTIONS,
  type AnswerValues,
  type Prefill,
} from "./answers";

interface State {
  /** What the fields show. Returned on every submit so React's post-submit form reset keeps them filled. */
  values: AnswerValues;
  result: { ok: true; text: string } | { ok: false; text: string } | null;
  budgetError: string | null;
  /** Saved at least once on this page: the budget is now this session's, no need to retype. */
  saved: boolean;
  /** Bumped on each submit to remount the fields with the latest values. */
  version: number;
}

export interface AnswersFormProps {
  tripId: string;
  name: string;
  windows: { id: string; label: string }[];
  prefill: Prefill;
  /** Why answers can't be saved; null while they can. */
  locked: string | null;
}

export function AnswersForm({ tripId, name, windows, prefill, locked }: AnswersFormProps) {
  const router = useRouter();
  const [state, formAction] = useActionState(
    async (prev: State, formData: FormData): Promise<State> => {
      const values = readAnswers(formData);
      const next = { ...prev, values, version: prev.version + 1 };
      const budgetInr = parseBudget(values.budget);
      if (budgetInr === null) {
        return { ...next, result: { ok: false, text: BUDGET_ERROR }, budgetError: BUDGET_ERROR };
      }
      const res = await saveResponse(tripId, {
        budgetInr,
        availableWindowIds: values.windowIds,
        dealbreakers: values.dealbreakers,
        tripType: values.tripType,
        asName: name,
      }).catch(() => ({ ok: false as const, message: UNREACHABLE }));
      // PIN changed or cookie gone: this page redirects to the trip home, which asks again.
      if (!res.ok && lostAccess(res.message)) router.refresh();
      return res.ok
        ? { ...next, result: { ok: true, text: res.savedAtText }, budgetError: null, saved: true }
        : { ...next, result: { ok: false, text: res.message }, budgetError: null };
    },
    { values: prefill.values, result: null, budgetError: null, saved: false, version: 0 },
  );

  // Bring the outcome into view (and to screen readers' attention) after each submit.
  const resultRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.version > 0) resultRef.current?.focus();
  }, [state.version]);

  const v = state.values;
  return (
    <form action={formAction} className="flex flex-col gap-8">
      {locked && <Notice tone="info">{locked}</Notice>}

      <fieldset key={state.version} disabled={locked !== null} className="flex min-w-0 flex-col gap-8">
        <legend className="sr-only">Your answers</legend>
        <BudgetField
          name="budget"
          // Styled like the other questions' titles.
          label={<span className="font-display text-xl leading-7 font-medium">Budget per person</span>}
          defaultValue={v.budget}
          fromCity={REFERENCE_CITY}
          retype={prefill.retype && !state.saved}
          error={state.budgetError}
          required
        />

        <ChoiceGroup
          type="checkbox"
          name="windows"
          legend="Which dates can you do?"
          hint="Tick all that work"
          options={windows.map((w) => ({ value: w.id, label: w.label }))}
          defaultValue={v.windowIds}
        />

        <ChoiceGroup
          type="radio"
          name="tripType"
          legend="What kind of trip?"
          options={TRIP_TYPE_OPTIONS}
          defaultValue={v.tripType || undefined}
          required
        />

        <ChoiceGroup
          type="checkbox"
          name="dealbreakers"
          legend="Anything you'd rule out?"
          hint="Optional"
          options={DEALBREAKER_OPTIONS}
          defaultValue={v.dealbreakers}
        />
      </fieldset>

      {state.result && (
        <Notice
          ref={resultRef}
          tabIndex={-1}
          tone={state.result.ok ? "success" : "error"}
          className="scroll-mb-32"
        >
          {state.result.text}
        </Notice>
      )}

      {locked === null && (
        <div className="sticky bottom-0 z-10 -mx-4 border-t border-border bg-bg px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <SubmitButton pendingLabel="Saving…">Save as {name}</SubmitButton>
        </div>
      )}
    </form>
  );
}
