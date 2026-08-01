"use client";

/* --------------------------------------------------------------------------
   Navbar "Studio" tab treatments, each shown inside a mock nav bar so the
   marker can be judged in context. Hover the Studio link to see motion.
-------------------------------------------------------------------------- */

const OTHER_LINKS = ["Features", "How it works", "Pricing"];

function NavShell({
  studio,
  caption,
}: {
  studio: React.ReactNode;
  caption: string;
}) {
  return (
    <div>
      <p className="mb-2 font-mono text-xs tracking-[0.15em] text-muted-foreground uppercase">
        {caption}
      </p>
      <div className="rounded-xl border border-border bg-background/80 backdrop-blur-md">
        <nav className="flex h-16 items-center justify-between gap-6 px-6">
          <span className="font-bold tracking-tight">kirmizi</span>
          <div className="flex items-center gap-7 text-sm text-muted-foreground">
            {OTHER_LINKS.map((l) => (
              <span
                key={l}
                className="cursor-default transition-colors hover:text-foreground"
              >
                {l}
              </span>
            ))}
            {studio}
          </div>
          <span className="rounded-full bg-red px-3 py-1.5 text-xs font-medium text-red-foreground">
            Start recording
          </span>
        </nav>
      </div>
    </div>
  );
}

/* Nav 01 — the current margin note (baseline, for comparison). */
export function NavMargin() {
  return (
    <NavShell
      caption="Nav 01 — Margin note (current)"
      studio={
        <a
          href="/studio"
          className="group relative cursor-pointer text-foreground transition-colors"
        >
          Studio
          <span className="pointer-events-none absolute -top-3 left-[91%] -translate-x-1/2 rotate-14 font-serif text-sm leading-none text-red italic">
            new
          </span>
        </a>
      }
    />
  );
}

/* Nav 02 — a small red pill badge after the label. */
export function NavPill() {
  return (
    <NavShell
      caption="Nav 02 — Pill badge"
      studio={
        <a
          href="/studio"
          className="group inline-flex cursor-pointer items-center gap-1.5 text-foreground transition-colors"
        >
          Studio
          <span className="rounded-full bg-red px-1.5 py-0.5 font-mono text-[0.6rem] font-semibold tracking-[0.12em] text-red-foreground uppercase transition-transform group-hover:-translate-y-px">
            New
          </span>
        </a>
      }
    />
  );
}

/* Nav 03 — a live pulsing dot before the label. */
export function NavPulse() {
  return (
    <NavShell
      caption="Nav 03 — Live pulse dot"
      studio={
        <a
          href="/studio"
          className="inline-flex cursor-pointer items-center gap-2 text-foreground transition-colors"
        >
          <span className="record-dot record-dot--live size-1.5 bg-red" />
          Studio
        </a>
      }
    />
  );
}

/* Nav 04 — glow + animated underline that sweeps on hover, with a hairline
   NEW tag. Quiet at rest, lively on hover. */
export function NavGlow() {
  return (
    <NavShell
      caption="Nav 04 — Glow + animated underline"
      studio={
        <a
          href="/studio"
          className="group relative inline-flex cursor-pointer items-center gap-1.5 text-foreground"
        >
          <span className="relative">
            Studio
            <span className="absolute -bottom-1 left-0 h-px w-0 bg-red transition-all duration-300 group-hover:w-full" />
          </span>
          <span className="font-serif text-xs text-red italic">new</span>
          <span
            aria-hidden
            className="pointer-events-none absolute -inset-x-2 -inset-y-1 -z-10 rounded-md opacity-0 blur-md transition-opacity duration-300 group-hover:opacity-100"
            style={{
              background:
                "radial-gradient(50% 60% at 50% 50%, var(--glow), transparent 70%)",
            }}
          />
        </a>
      }
    />
  );
}

/* Nav 05 — the Spotlight ribbon, shrunk. A tiny diagonal red "NEW" banner
   pinned to the top-right of the label, exactly like the teaser card. Lifts
   slightly on hover. */
export function NavRibbon() {
  return (
    <NavShell
      caption="Nav 05 — Corner ribbon (from Teaser 02)"
      studio={
        <a
          href="/studio"
          className="group relative inline-flex cursor-pointer items-center pr-1 text-foreground"
        >
          Studio
          <span
            aria-hidden
            className="pointer-events-none absolute -right-3.5 -top-2.5 rotate-45 rounded-[2px] bg-red px-3 py-px font-mono text-[0.5rem] font-semibold leading-none tracking-[0.15em] text-red-foreground uppercase shadow-md transition-transform duration-300 group-hover:-translate-y-px"
          >
            New
          </span>
        </a>
      }
    />
  );
}

/* Nav 06 — folded corner tab. The whole Studio label sits in a bordered chip
   with a red diagonal fold cut into its top-right corner — a subtler nod to
   the ribbon that reads as "tagged / new". */
export function NavCornerTab() {
  return (
    <NavShell
      caption="Nav 06 — Folded corner tab"
      studio={
        <a
          href="/studio"
          className="group relative inline-flex cursor-pointer items-center overflow-hidden rounded-md border border-red/30 bg-red/5 px-2.5 py-1 text-foreground transition-colors hover:border-red/60 hover:bg-red/10"
        >
          Studio
          {/* diagonal fold in the corner */}
          <span
            aria-hidden
            className="pointer-events-none absolute right-0 top-0 size-0 border-t-[14px] border-l-[14px] border-t-red border-l-transparent"
          />
        </a>
      }
    />
  );
}

/* Nav 07 — floating pennant. A small angled ribbon that sits just above the
   word like a flag on a pole, with a live pulse dot. More playful, still
   compact. */
export function NavPennant() {
  return (
    <NavShell
      caption="Nav 07 — Floating pennant"
      studio={
        <a
          href="/studio"
          className="group relative inline-flex cursor-pointer items-center text-foreground"
        >
          Studio
          <span
            aria-hidden
            className="pointer-events-none absolute -right-2 -top-3 flex -rotate-12 items-center gap-1 rounded-sm bg-red px-1.5 py-px font-mono text-[0.5rem] font-semibold leading-none tracking-[0.12em] text-red-foreground uppercase shadow-md transition-transform duration-300 group-hover:-rotate-6 group-hover:-translate-y-px"
          >
            <span className="record-dot record-dot--live size-1 bg-red-foreground" />
            New
          </span>
        </a>
      }
    />
  );
}

/* Nav 08 — shimmer pill. A NEW badge with a bright band sweeping across every
   few seconds. Motion happens on its own — no hover needed. */
export function NavShimmer() {
  return (
    <NavShell
      caption="Nav 08 — Shimmer pill (always-on)"
      studio={
        <a
          href="/studio"
          className="group inline-flex cursor-pointer items-center gap-1.5 text-foreground"
        >
          Studio
          <span className="nav-shimmer rounded-full px-1.5 py-0.5 font-mono text-[0.6rem] font-semibold tracking-[0.12em] text-red-foreground uppercase shadow-sm">
            New
          </span>
        </a>
      }
    />
  );
}

/* Nav 09 — attention wiggle. A pennant-style tag that gives a tiny periodic
   wiggle to catch the eye, then rests. */
export function NavWiggle() {
  return (
    <NavShell
      caption="Nav 09 — Attention wiggle (always-on)"
      studio={
        <a
          href="/studio"
          className="group relative inline-flex cursor-pointer items-center text-foreground"
        >
          Studio
          <span
            aria-hidden
            className="nav-wiggle pointer-events-none absolute -right-3 -top-3 rounded-sm bg-red px-1.5 py-px font-mono text-[0.5rem] font-semibold leading-none tracking-[0.12em] text-red-foreground uppercase shadow-md"
          >
            New
          </span>
        </a>
      }
    />
  );
}

/* Nav 10 — recording playhead. A red bar sweeps under the word on a loop, like
   a recording timeline — the most "Studio-native" motion. */
export function NavPlayhead() {
  return (
    <NavShell
      caption="Nav 10 — Recording playhead (always-on)"
      studio={
        <a
          href="/studio"
          className="group relative inline-flex cursor-pointer items-center gap-1.5 text-foreground"
        >
          <span className="relative">
            Studio
            <span className="absolute -bottom-1 left-0 h-0.5 w-full overflow-hidden rounded-full bg-red/15">
              <span className="nav-playhead block h-full w-full rounded-full bg-red" />
            </span>
          </span>
          <span className="font-mono text-[0.6rem] font-semibold tracking-[0.12em] text-red uppercase">
            New
          </span>
        </a>
      }
    />
  );
}

/* Nav 11 — radar ping. A live dot that emits an expanding ring on a loop,
   pulling focus like a "record is live" indicator. */
export function NavPing() {
  return (
    <NavShell
      caption="Nav 11 — Radar ping (always-on)"
      studio={
        <a
          href="/studio"
          className="group inline-flex cursor-pointer items-center gap-2 text-foreground"
        >
          <span className="relative flex size-1.5 items-center justify-center">
            <span
              aria-hidden
              className="nav-ping absolute size-1.5 rounded-full bg-red"
            />
            <span className="relative size-1.5 rounded-full bg-red" />
          </span>
          Studio
          <span className="rounded-full border border-red/40 px-1.5 py-px font-mono text-[0.55rem] font-semibold tracking-[0.12em] text-red uppercase">
            New
          </span>
        </a>
      }
    />
  );
}
