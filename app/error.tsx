"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";
import { Button, buttonVariants } from "@/components/ui/button";
import { Wordmark } from "@/components/wordmark";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main
      id="main-content"
      className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center"
    >
      <Wordmark />
      <p className="mt-4 font-mono text-sm text-red">Error</p>
      <h1 className="font-bold text-4xl tracking-tight sm:text-5xl">
        Something went sideways.
      </h1>
      <p className="max-w-sm text-muted-foreground">
        An unexpected error interrupted that — nothing left your browser. Try
        again, and if it keeps happening, reload the page.
      </p>
      <div className="mt-2 flex items-center gap-2">
        <Button onClick={reset}>Try again</Button>
        <Link href="/" className={cn(buttonVariants({ variant: "outline" }))}>
          Back to home
        </Link>
      </div>
    </main>
  );
}
