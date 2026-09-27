"use client";

// Backstop for anything the pages don't catch themselves, so a friend never sees a blank
// "Application error" screen.

import { Button } from "@/app/ui/button";
import { Page } from "@/app/ui/page-shell";

export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <Page>
      <h1 className="pt-8 font-display text-3xl leading-9 font-semibold">Something went wrong.</h1>
      <p className="text-base leading-6 text-muted-fg">Check your connection and try again.</p>
      <Button onClick={() => retry()}>Try again</Button>
    </Page>
  );
}
