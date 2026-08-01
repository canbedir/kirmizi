import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Reveal } from "@/components/landing/reveal";

// A door to the studio page, for people whose recordings need more than a
// trim. Deliberately quiet: the simple path is still the default one.
export function StudioTeaser() {
  return (
    <section className="mx-auto max-w-6xl px-6 pb-8">
      <Reveal>
        <Link
          href="/studio"
          className="group flex flex-col gap-5 rounded-2xl border border-border bg-surface/40 p-6 transition-colors hover:border-red/40 sm:flex-row sm:items-center sm:justify-between sm:p-8"
        >
          <div className="max-w-xl">
            <p className="mb-2 font-mono text-xs tracking-[0.2em] text-red uppercase">
              Studio
            </p>
            <p className="font-bold text-2xl tracking-tight sm:text-3xl">
              Recording something you&apos;ll show people?
            </p>
            <p className="mt-2 leading-relaxed text-muted-foreground">
              It can place the zooms for you, from where you clicked — and mark
              the clicks while it&apos;s at it.
            </p>
          </div>

          <span className="inline-flex flex-none items-center gap-2 font-mono text-sm text-muted-foreground transition-colors group-hover:text-foreground">
            See the studio
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>
      </Reveal>
    </section>
  );
}
