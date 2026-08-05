import { Check, Puzzle, X } from "lucide-react";
import { Reveal } from "@/components/landing/reveal";
import { cn } from "@/lib/cn";
import { companionInStore, companionUrl, siteConfig } from "@/lib/site";
import { buttonVariants } from "@/components/ui/button";

// The honest part of the pitch. Studio needs an extension, and an extension
// asking to run on every site deserves a plain account of what it does —
// including the two places it genuinely can't help.

const sees = [
  "Where the pointer moved, as fractions of the screen",
  "When a click happened, and which button",
];

const doesNot = [
  "Anything on the page — text, images, forms, addresses",
  "Clicks outside a web page: other apps, or the browser's own toolbar",
];

export function CompanionNote() {
  return (
    <section id="companion" className="scroll-mt-20 px-6 py-24 sm:py-28">
      <Reveal className="mx-auto max-w-4xl">
        <div className="rounded-2xl border border-border bg-surface/40 p-6 sm:p-10">
          <p className="mb-3 font-mono text-xs tracking-[0.2em] text-muted-foreground uppercase">
            What it needs
          </p>
          <h2 className="font-bold text-3xl leading-tight tracking-tight sm:text-4xl">
            One small extension, and nothing else.
          </h2>
          <p className="mt-4 max-w-2xl leading-relaxed text-muted-foreground">
            A web page can&apos;t see the mouse on surfaces it doesn&apos;t own —
            a good rule, and one we&apos;re not trying to get around. The
            companion extension supplies those coordinates and stops there: it
            holds them in memory, hands them to your own tab when the recording
            ends, and forgets them. It has no storage and no network access at
            all.
          </p>

          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            <div>
              <p className="mb-3 font-mono text-xs tracking-wide text-muted-foreground uppercase">
                It records
              </p>
              <ul className="space-y-2.5">
                {sees.map((line) => (
                  <li key={line} className="flex gap-2.5 text-sm">
                    <Check className="mt-0.5 size-4 flex-none text-red" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-3 font-mono text-xs tracking-wide text-muted-foreground uppercase">
                It never sees
              </p>
              <ul className="space-y-2.5">
                {doesNot.map((line) => (
                  <li key={line} className="flex gap-2.5 text-sm">
                    <X className="mt-0.5 size-4 flex-none text-muted-foreground" />
                    <span className="text-muted-foreground">{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-4 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
              Without it, everything else still works — recording, trimming,
              frames, camera, export. You lose the zooms and the click marks,
              and nothing more.
            </p>

            <div className="flex flex-none flex-col items-start gap-2 sm:items-end">
              <a
                href={companionUrl}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  buttonVariants({ size: "sm" }),
                  "gap-2 whitespace-nowrap",
                )}
              >
                <Puzzle className="size-4" />
                {companionInStore
                  ? "Add to Chrome — it's free"
                  : "Get the extension"}
              </a>
              <a
                href={`${siteConfig.githubUrl}/tree/main/extension`}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                or read every line of it
              </a>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
