import { Reveal } from "@/components/landing/reveal";
import { StepVisual } from "@/components/landing/how-visuals";

const steps = [
  {
    n: "01",
    title: "Pick your screen",
    body: "Hit record and choose a screen, window, or tab in the browser's own picker. Your JS never touches the screen — you grant it.",
  },
  {
    n: "02",
    title: "Record",
    body: "A 3·2·1 countdown, then a quiet HUD with a live timer. Add your mic or a webcam bubble if you want them.",
  },
  {
    n: "03",
    title: "Trim & download",
    body: "Cut it down in the in-browser editor and download the file — straight from your machine, no upload.",
  },
];

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="mx-auto max-w-6xl scroll-mt-20 px-6 py-24 sm:py-32"
    >
      <Reveal className="mb-14 max-w-xl">
        <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
          How it works
        </p>
        <h2 className="font-bold text-4xl leading-tight tracking-tight sm:text-5xl">
          Three steps, no setup.
        </h2>
      </Reveal>

      <div className="grid gap-10 sm:grid-cols-3 sm:gap-8">
        {steps.map((step, i) => (
          <Reveal key={step.n} delay={i * 0.08}>
            <div className="flex flex-col gap-5">
              <StepVisual n={i} />
              <div className="flex flex-col gap-2 border-t border-border pt-4">
                <span className="font-mono text-sm text-red">{step.n}</span>
                <h3 className="font-bold text-2xl">{step.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {step.body}
                </p>
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
