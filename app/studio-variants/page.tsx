import type { Metadata } from "next";
import {
  TeaserLaunchBanner,
  TeaserSpotlight,
  TeaserReleaseNote,
} from "@/components/landing/studio-variants";
import {
  NavPill,
  NavPulse,
  NavGlow,
  NavMargin,
} from "@/components/landing/studio-nav-variants";

export const metadata: Metadata = {
  title: "Studio teaser — design variants",
  description: "Design explorations for the Studio feature teaser and navbar tab.",
};

function Label({ n, title, note }: { n: string; title: string; note: string }) {
  return (
    <div className="mb-6 flex items-baseline gap-3">
      <span className="font-mono text-xs tracking-[0.2em] text-red uppercase">
        {n}
      </span>
      <div>
        <h2 className="font-bold text-lg leading-tight">{title}</h2>
        <p className="text-sm text-muted-foreground">{note}</p>
      </div>
    </div>
  );
}

export default function StudioVariantsPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-16">
      <header className="mb-14">
        <p className="font-mono text-xs tracking-[0.2em] text-red uppercase">
          Explorations
        </p>
        <h1 className="mt-2 font-bold text-3xl leading-tight tracking-tight text-balance sm:text-4xl">
          Studio teaser — design variants
        </h1>
        <p className="mt-3 max-w-2xl leading-relaxed text-muted-foreground">
          Three directions for the &ldquo;new feature&rdquo; teaser, plus four
          treatments for the Studio tab in the navbar. Same warm-black palette,
          red used only as punctuation. Pick one (or mix parts) and hand it off.
        </p>
      </header>

      {/* ---------------------------------------------------------------- */}
      <section className="mb-20">
        <Label
          n="Teaser 01"
          title="Launch banner"
          note="A red NEW pill with a live pulse, a shimmering hairline border, and a brighter glow. Loudest, still on-brand."
        />
        <TeaserLaunchBanner />
      </section>

      <section className="mb-20">
        <Label
          n="Teaser 02"
          title="Spotlight"
          note="A bigger mock that bleeds past the panel edge, a corner NEW ribbon, and a live record dot. Feels like a spotlight moment."
        />
        <TeaserSpotlight />
      </section>

      <section className="mb-24">
        <Label
          n="Teaser 03"
          title="Release note"
          note="Framed like a shipping note — a Just shipped tag, a window chrome mock, and a quiet animated caption. Most editorial."
        />
        <TeaserReleaseNote />
      </section>

      {/* ---------------------------------------------------------------- */}
      <div className="mb-8 border-t border-border pt-14">
        <p className="font-mono text-xs tracking-[0.2em] text-red uppercase">
          Navbar
        </p>
        <h2 className="mt-2 font-bold text-2xl leading-tight tracking-tight">
          Studio tab treatments
        </h2>
        <p className="mt-2 max-w-2xl leading-relaxed text-muted-foreground">
          Shown on a mock nav bar so you can judge them in context. Hover to see
          motion.
        </p>
      </div>

      <div className="grid gap-5">
        <NavMargin />
        <NavPill />
        <NavPulse />
        <NavGlow />
      </div>
    </main>
  );
}
