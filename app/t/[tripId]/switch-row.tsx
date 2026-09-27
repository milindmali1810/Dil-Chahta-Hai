"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { switchName } from "@/app/actions";
import { Button } from "@/app/ui/button";
import { AlertTriangle, Loader } from "@/app/ui/icons";
import { lostAccess, UNREACHABLE } from "./helpers";

/**
 * "You're Asha · Not you? Switch". Switch drops the name (not the PIN) and goes back to
 * the name picker on the trip home.
 */
export function SwitchRow({ tripId, name, backToHome = false }: { tripId: string; name: string; backToHome?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSwitch() {
    setError(null);
    startTransition(async () => {
      const result = await switchName(tripId).catch(() => ({ ok: false as const, message: UNREACHABLE }));
      if (!result.ok) {
        setError(result.message);
        if (lostAccess(result.message)) router.push(`/t/${encodeURIComponent(tripId)}`);
        return;
      }
      if (backToHome) router.push(`/t/${encodeURIComponent(tripId)}`);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-x-2 text-base leading-6">
        <span className="min-w-0 break-words">
          You&apos;re <strong className="font-bold">{name}</strong> · Not you?
        </span>
        <Button variant="quiet" fullWidth={false} className="px-2" onClick={onSwitch} disabled={pending}>
          {pending && <Loader />}
          <span>{pending ? "Switching…" : "Switch"}</span>
        </Button>
      </div>
      {error && (
        <p role="alert" className="flex items-start gap-2 text-sm leading-5 font-bold text-error">
          <AlertTriangle size={18} className="mt-px shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
