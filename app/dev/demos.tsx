"use client";

// Interactive bits of the dev preview. Client-only actions: nothing reaches the server.

import { useState } from "react";
import { Button } from "@/app/ui/button";
import { ConfirmDialog } from "@/app/ui/confirm-dialog";
import { Notice } from "@/app/ui/notice";
import { SubmitButton } from "@/app/ui/submit-button";

export function DemoSubmitForm() {
  const [saved, setSaved] = useState(false);
  async function fakeSave() {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    setSaved(true);
  }
  return (
    <form action={fakeSave} className="flex flex-col gap-3">
      <SubmitButton pendingLabel="Saving…">Save as Asha</SubmitButton>
      {saved && <Notice tone="success">Saved at 9:42 PM. You can edit until Wed 30 Sep, 11:59 PM IST</Notice>}
    </form>
  );
}

export function DemoConfirmDialog() {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <Button variant="danger-outline" onClick={() => setOpen(true)}>
        Lock now
      </Button>
      <ConfirmDialog
        open={open}
        message="Lock now? Friends can't edit until you unlock."
        confirmLabel="Lock now"
        confirmVariant="danger-outline"
        onConfirm={() => {
          setOpen(false);
          setResult("Confirmed");
        }}
        onCancel={() => {
          setOpen(false);
          setResult("Cancelled");
        }}
      />
      {result && <p className="text-sm text-muted-fg">Last answer: {result}</p>}
    </div>
  );
}
