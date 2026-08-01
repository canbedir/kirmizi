"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

/* --------------------------------------------------------------------------
   A compact, mostly-static mock of the studio editor. Shares the language of
   the real MiniDemo (paper canvas, dark rail, red record chip) but stays
   simple so each teaser variant can frame it differently. The one live touch
   is the record dot, which reuses the site's .record-dot--live pulse.
-------------------------------------------------------------------------- */
function EditorMock({ className = "" }: { className?: string }) {
  return (
    <div
      className={`relative aspect-16/10 w-full overflow-hidden rounded-lg border border-border bg-black ${className}`}
    >
      <div className="absolute inset-0 bg-[#f7f6f3]">
        {/* left rail */}
        <div className="absolute inset-y-0 left-0 w-[15%] bg-[#15130f]">
          <div className="mt-[9%] ml-[16%] h-[5%] w-[56%] rounded-sm bg-red" />
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="mt-[10%] ml-[16%] h-[4%] rounded-sm bg-white/15"
              style={{ width: `${66 - i * 16}%` }}
            />
          ))}
        </div>
        {/* top bar */}
        <div className="absolute inset-x-[15%] top-0 h-[15%] bg-white" />

        {/* two cards */}
        {[0.2, 0.58].map((left) => (
          <div
            key={left}
            className="absolute top-[24%] h-[26%] w-[33%] rounded-md bg-white shadow-sm"
            style={{ left: `${left * 100}%` }}
          >
            <div className="absolute top-[18%] left-[10%] h-[13%] w-[54%] rounded-sm bg-[#e9e6df]" />
            <div className="absolute top-[42%] left-[24%] h-[26%] w-[52%] rounded-sm bg-[#15130f]" />
          </div>
        ))}

        {/* lower panel */}
        <div className="absolute top-[58%] right-[9%] bottom-[9%] left-[20%] rounded-md bg-white shadow-sm">
          <div className="absolute top-[14%] left-[7%] h-[12%] w-[30%] rounded-sm bg-[#eceae4]" />
          <div className="absolute top-[21%] left-[44%] h-[24%] w-[30%] rounded-md bg-red" />
          <div className="absolute top-[58%] left-[7%] h-[10%] w-[64%] rounded-sm bg-[#eceae4]" />
          <div className="absolute top-[76%] left-[7%] h-[10%] w-[44%] rounded-sm bg-[#eceae4]" />
        </div>

        {/* a zoom frame + pointer, hinting at the auto-zoom behaviour */}
        <div className="absolute top-[20%] left-[17%] h-[34%] w-[38%] rounded-md border-2 border-red/80" />
        <svg
          viewBox="0 0 12 18"
          aria-hidden
          className="absolute top-[38%] left-[34%] w-[5%]"
        >
          <path
            d="M0 0 L0 13.5 L3.4 10.4 L5.6 15.3 L7.6 14.4 L5.4 9.5 L9.5 9.5 Z"
            fill="#fff"
            stroke="rgba(20,18,16,0.85)"
            strokeWidth="1"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
}

const COPY = {
  eyebrow: "Studio",
  title: "Recording something you'll show people?",
  body: "It places the zooms for you, from where you clicked — eased in, held, and let go — then marks the clicks while it's at it.",
  cta: "See the studio",
} as const;

/* ==========================================================================
   Teaser 01 — Launch banner
   A loud-but-tasteful NEW pill (live dot), an animated shimmer hairline, and
   a stronger brand glow. The card is a touch taller and brighter.
========================================================================== */
export function TeaserLaunchBanner() {
  return (
    <Link
      href="/studio"
      className="group relative block overflow-hidden rounded-2xl border border-red/25 bg-surface/50 p-6 transition-colors hover:border-red/50 sm:p-10"
    >
      {/* brighter, wider glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-28 -right-10 h-80 w-[30rem] rounded-full opacity-60 blur-3xl transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background:
            "radial-gradient(50% 50% at 50% 50%, var(--glow), transparent 70%)",
        }}
      />
      {/* animated shimmer hairline along the top */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-70"
        style={{
          background:
            "linear-gradient(90deg, transparent, var(--red), transparent)",
          backgroundSize: "40% 100%",
          animation: "btn-record-flow 4s ease-in-out infinite",
        }}
      />

      <div className="relative grid items-center gap-8 sm:grid-cols-[1fr_20rem] sm:gap-12">
        <div>
          <div className="mb-4 flex items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red px-2.5 py-1 font-mono text-[0.68rem] font-semibold tracking-[0.18em] text-red-foreground uppercase">
              <span className="record-dot record-dot--live size-1.5 bg-red-foreground" />
              New
            </span>
            <span className="font-mono text-xs tracking-[0.2em] text-muted-foreground uppercase">
              {COPY.eyebrow}
            </span>
          </div>
          <p className="font-bold text-2xl leading-tight tracking-tight text-balance sm:text-3xl">
            {COPY.title}
          </p>
          <p className="mt-3 max-w-md leading-relaxed text-muted-foreground">
            {COPY.body}
          </p>
          <span className="mt-6 inline-flex items-center gap-2 font-mono text-sm text-foreground">
            {COPY.cta}
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
          </span>
        </div>

        <EditorMock className="transition-transform duration-500 group-hover:-translate-y-1" />
      </div>
    </Link>
  );
}

/* ==========================================================================
   Teaser 02 — Spotlight
   Bigger mock that bleeds past the panel edge, a diagonal corner ribbon, and
   a live record chip floating on the mock. Feels like a stage light.
========================================================================== */
export function TeaserSpotlight() {
  return (
    <Link
      href="/studio"
      className="group relative block overflow-hidden rounded-2xl border border-border bg-surface/40 transition-colors hover:border-red/40"
    >
      {/* corner ribbon */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-12 top-6 z-20 rotate-45 bg-red px-14 py-1 text-center font-mono text-[0.7rem] font-semibold tracking-[0.2em] text-red-foreground uppercase shadow-lg"
      >
        New
      </div>

      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 -left-10 h-80 w-[28rem] rounded-full opacity-50 blur-3xl transition-opacity duration-500 group-hover:opacity-90"
        style={{
          background:
            "radial-gradient(50% 50% at 50% 50%, var(--glow), transparent 70%)",
        }}
      />

      <div className="relative grid items-center gap-6 p-6 sm:grid-cols-[1fr_1.15fr] sm:gap-4 sm:p-10 sm:pr-0">
        <div className="sm:pr-4">
          <p className="mb-3 font-mono text-xs tracking-[0.2em] text-red uppercase">
            {COPY.eyebrow}
          </p>
          <p className="font-bold text-2xl leading-tight tracking-tight text-balance sm:text-4xl">
            {COPY.title}
          </p>
          <p className="mt-4 max-w-md leading-relaxed text-muted-foreground">
            {COPY.body}
          </p>
          <span className="mt-6 inline-flex items-center gap-2 font-mono text-sm text-foreground">
            {COPY.cta}
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
          </span>
        </div>

        {/* mock bleeds toward the right edge and tilts slightly on hover */}
        <div className="relative sm:translate-x-6">
          <div className="relative transition-transform duration-500 group-hover:-translate-y-1 group-hover:-rotate-1">
            <EditorMock />
            {/* live record chip on the mock */}
            <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-[#15130f]/85 px-2.5 py-1 backdrop-blur-sm">
              <span className="record-dot record-dot--live size-2 bg-red" />
              <span className="font-mono text-[0.62rem] tracking-[0.15em] text-white/90 uppercase">
                Rec
              </span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

/* ==========================================================================
   Teaser 03 — Release note
   Editorial framing: a "Just shipped" tag, window chrome on the mock, and a
   quiet animated caption line. The calmest of the three.
========================================================================== */
export function TeaserReleaseNote() {
  return (
    <Link
      href="/studio"
      className="group relative block overflow-hidden rounded-2xl border border-border bg-surface/40 p-6 transition-colors hover:border-red/40 sm:p-10"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-16 h-72 w-96 rounded-full opacity-40 blur-3xl transition-opacity duration-500 group-hover:opacity-80"
        style={{
          background:
            "radial-gradient(50% 50% at 50% 50%, var(--glow), transparent 70%)",
        }}
      />

      <div className="relative grid items-center gap-8 sm:grid-cols-[1fr_20rem] sm:gap-12">
        <div>
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-red/30 bg-red/10 px-3 py-1">
            <span className="record-dot record-dot--live size-1.5 bg-red" />
            <span className="font-mono text-[0.68rem] tracking-[0.18em] text-red uppercase">
              Just shipped
            </span>
            <span className="font-serif text-sm text-red/70 italic">
              studio
            </span>
          </div>
          <p className="font-bold text-2xl leading-tight tracking-tight text-balance sm:text-3xl">
            {COPY.title}
          </p>
          <p className="mt-3 max-w-md leading-relaxed text-muted-foreground">
            {COPY.body}
          </p>
          {/* quiet animated caption */}
          <p
            className="mt-4 font-mono text-xs text-muted-foreground/70"
            style={{ animation: "btn-record-blink 3s ease-in-out infinite" }}
          >
            auto-zoom · click marks · one take
          </p>
          <span className="mt-6 inline-flex items-center gap-2 font-mono text-sm text-foreground">
            {COPY.cta}
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
          </span>
        </div>

        {/* window chrome around the mock */}
        <div className="overflow-hidden rounded-lg border border-border bg-[#15130f]">
          <div className="flex items-center gap-1.5 px-3 py-2">
            <span className="size-2 rounded-full bg-white/20" />
            <span className="size-2 rounded-full bg-white/20" />
            <span className="size-2 rounded-full bg-red" />
            <span className="ml-2 font-mono text-[0.6rem] tracking-wide text-white/40">
              studio.kirmizi.app
            </span>
          </div>
          <EditorMock className="rounded-none border-0 border-t border-border" />
        </div>
      </div>
    </Link>
  );
}
