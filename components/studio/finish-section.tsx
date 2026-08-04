import { Reveal } from "@/components/landing/reveal";
import { PaceDemo } from "@/components/studio/pace-demo";
import { ShapeDemo } from "@/components/studio/shape-demo";

/**
 * The rest of the finishing — the parts that aren't zoom. Each claim is made
 * next to the thing doing it, because the pacing rule in particular is far
 * easier to see than to read.
 */
export function FinishSection() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-24 sm:py-28">
      <Reveal className="mb-12 max-w-2xl">
        <p className="mb-3 font-mono text-xs tracking-[0.2em] text-muted-foreground uppercase">
          And the rest of it
        </p>
        <h2 className="font-bold text-4xl leading-tight tracking-tight sm:text-5xl">
          The parts you&apos;d otherwise do by hand.
        </h2>
      </Reveal>

      <div className="grid gap-14 lg:grid-cols-2 lg:gap-16">
        <Reveal className="min-w-0">
          <PaceDemo />
          <h3 className="mt-6 font-bold text-2xl tracking-tight">
            It cuts the dead air — on two signals, not one
          </h3>
          <p className="mt-3 leading-relaxed text-muted-foreground text-pretty">
            Every editor cuts on silence, which ruins a screen recording: plenty
            of good demos have no narration at all. Cutting on an idle pointer
            ruins the other half, because the moment someone stops moving the
            mouse to explain something is usually the moment that matters.
          </p>
          <p className="mt-3 leading-relaxed text-muted-foreground text-pretty">
            So neither decides alone. A stretch goes only when it&apos;s quiet{" "}
            <em className="text-foreground not-italic">and</em> the pointer is
            parked — and when a recording only has one of the two, that one
            carries it.
          </p>
        </Reveal>

        <Reveal delay={0.1} className="min-w-0">
          <ShapeDemo />
          <h3 className="mt-6 font-bold text-2xl tracking-tight">
            It exports in a shape you didn&apos;t record in
          </h3>
          <p className="mt-3 leading-relaxed text-muted-foreground text-pretty">
            A screen is always wide, and the places clips get posted often
            aren&apos;t. Ask for 9:16 and a 1920×1080 capture comes out at
            1080×1920 — the size vertical video is actually uploaded at.
          </p>
          <p className="mt-3 leading-relaxed text-muted-foreground text-pretty">
            The recording is never cropped or squashed to fit. It keeps its
            proportions, sits in the middle, and the background fills the room
            that opens up — which is the whole point of a taller frame.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
