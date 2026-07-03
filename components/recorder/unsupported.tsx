import Link from "next/link";
import { MonitorX } from "lucide-react";
import type { MediaSupport } from "@/lib/use-media-support";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export function Unsupported({ support }: { support: MediaSupport }) {
  const reason = !support.secureContext
    ? "Screen recording needs a secure (HTTPS) connection."
    : "This browser doesn't support the screen-capture APIs Kırmızı needs.";

  return (
    <div className="flex max-w-md flex-col items-center gap-6 text-center">
      <span className="grid size-16 place-items-center rounded-full border border-border text-muted-foreground">
        <MonitorX className="size-7" />
      </span>
      <div className="space-y-2">
        <h1 className="font-serif text-3xl">Not supported here</h1>
        <p className="text-muted-foreground">{reason}</p>
      </div>
      <p className="text-sm text-muted-foreground">
        Kırmızı works best in a recent{" "}
        <span className="text-foreground">Chrome</span>,{" "}
        <span className="text-foreground">Edge</span>, or{" "}
        <span className="text-foreground">Firefox</span> on desktop.
      </p>
      <Link href="/" className={cn(buttonVariants({ variant: "outline" }))}>
        Back to home
      </Link>
    </div>
  );
}
