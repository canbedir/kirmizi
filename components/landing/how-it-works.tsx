"use client";

import { motion, useReducedMotion } from "motion/react";
import { Reveal } from "@/components/landing/reveal";
import { StepVisual } from "@/components/landing/how-visuals";

const steps = [
  {
    title: "Pick your screen",
    body: "Hit record and choose a screen, window, or tab in the browser's own picker. Your JS never touches the screen — you grant it.",
  },
  {
    title: "Record",
    body: "A 3·2·1 countdown, then a quiet HUD with a live timer. Add your mic or a webcam bubble if you want them.",
  },
  {
    title: "Polish & download",
    body: "Cut it down, add a zoom or a styled frame, and download the file — straight from your machine, no upload.",
  },
];

// Each step's choreography starts this many seconds after the previous one,
// so the row plays 01 → 02 → 03 like a timeline.
const STEP_BEAT = 0.5;

function Step({
  index,
  title,
  body,
}: {
  index: number;
  title: string;
  body: string;
}) {
  const reduce = useReducedMotion();
  const d = reduce ? 0 : index * STEP_BEAT;
  const num = String(index + 1).padStart(2, "0");

  return (
    <div className="flex flex-col gap-5">
      {/* The track spans the full card row: 01 at the start of the first card,
          02 centred, 03 at the end of the last — lines fill the space between. */}
      <div
        className={
          "relative flex " +
          ["justify-start", "sm:justify-center", "sm:justify-end"][index]
        }
      >
        <span className="relative z-10 grid size-9 flex-none place-items-center rounded-full border border-border bg-background font-mono text-sm text-muted-foreground">
          {num}
          <motion.span
            className="absolute -inset-px grid place-items-center rounded-full border border-red/60 bg-red/10 font-mono text-sm text-red"
            initial={reduce ? undefined : { opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: d, duration: 0.35 }}
          >
            {num}
          </motion.span>
        </span>
        {index < steps.length - 1 && (
          <span
            aria-hidden
            className={
              "absolute top-1/2 hidden h-0.5 -translate-y-1/2 sm:block " +
              (index === 0
                ? "left-11.5 right-[calc(-50%-6px)]"
                : "left-[calc(50%+28px)] right-[calc(-100%+12px)]")
            }
          >
            <motion.span
              className="absolute inset-y-0 left-0 rounded-full bg-red/60"
              initial={reduce ? { width: "100%" } : { width: "0%" }}
              whileInView={{ width: "100%" }}
              viewport={{ once: true }}
              transition={{ delay: d + 0.2, duration: 0.4, ease: "easeInOut" }}
            />
          </span>
        )}
      </div>

      <StepVisual n={index} delay={d} />

      <motion.div
        className="flex flex-col gap-2"
        initial={reduce ? undefined : { opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ delay: d + 0.15, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <h3 className="font-bold text-2xl">{title}</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
      </motion.div>
    </div>
  );
}

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
          <Step key={step.title} index={i} title={step.title} body={step.body} />
        ))}
      </div>
    </section>
  );
}
