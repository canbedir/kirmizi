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
