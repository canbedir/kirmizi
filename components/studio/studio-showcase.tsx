import { Reveal } from "@/components/landing/reveal";
import { ZoomDemo } from "@/components/studio/zoom-demo";

/** The claim, then the thing itself doing it. */
export function StudioShowcase() {
  return (
    <section className="mx-auto max-w-5xl px-6 pb-8">
      <Reveal>
        <ZoomDemo />
      </Reveal>

      <Reveal delay={0.1}>
        <div className="mx-auto mt-8 grid max-w-3xl gap-6 text-sm sm:grid-cols-3">
          {[
            {
              n: "01",
              t: "It watches",
              b: "Pointer positions and click times are collected while you record.",
            },
            {
              n: "02",
              t: "It decides",
              b: "Clicks near each other become one moment; clicks apart become their own.",
            },
            {
              n: "03",
              t: "You overrule",
              b: "Every zoom lands on the timeline as an ordinary region. Drag, retime, delete.",
            },
          ].map((step) => (
            <div key={step.n}>
              <p className="font-mono text-xs text-red">{step.n}</p>
              <p className="mt-1.5 font-bold">{step.t}</p>
              <p className="mt-1 leading-relaxed text-muted-foreground">
                {step.b}
              </p>
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  );
}
