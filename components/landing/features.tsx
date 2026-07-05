"use client";

import { FileVideo, Mic, Scissors, ShieldCheck, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Reveal } from "@/components/landing/reveal";
import { FeatureDemo } from "@/components/landing/feature-demo";

const EASE = [0.22, 1, 0.36, 1] as const;

interface Feature {
  icon: LucideIcon;
  title: string;
  body: string;
}

const features: Feature[] = [
  {
    icon: ShieldCheck,
    title: "Local-only",
    body: "The file is built on your machine and never uploaded.",
  },
  {
    icon: Zap,
    title: "No account, ever",
    body: "Open the tab and record — no sign-up, no watermark.",
  },
  {
    icon: Mic,
    title: "Mic + system audio",
    body: "Mix in your voice; capture system sound where allowed.",
  },
  {
    icon: Scissors,
    title: "In-browser editor",
    body: "Multi-cut timeline with mute, speed, and undo.",
  },
  {
    icon: FileVideo,
    title: ".mp4 or .webm",
    body: "mp4 when the browser can encode it, webm everywhere else.",
  },
];

function FeatureItem({
  feature,
  index,
}: {
  feature: Feature;
  index: number;
}) {
  const reduce = useReducedMotion();
  const Icon = feature.icon;

  return (
    <motion.li
      className="flex items-start gap-3.5 border-b border-border py-4 first:pt-0 last:border-b-0 last:pb-0"
      initial={reduce ? undefined : { opacity: 0, x: -14 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.08, duration: 0.5, ease: EASE }}
    >
      <motion.span
        className="mt-0.5 grid size-8 flex-none place-items-center rounded-lg bg-red/10 text-red"
        initial={reduce ? undefined : { opacity: 0, scale: 0.5 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        transition={{
          delay: index * 0.08 + 0.12,
          type: "spring",
          stiffness: 300,
          damping: 18,
        }}
      >
        <Icon className="size-4" />
      </motion.span>
      <div>
        <p className="font-bold">{feature.title}</p>
        <p className="text-sm text-muted-foreground">{feature.body}</p>
      </div>
    </motion.li>
  );
}

export function Features() {
  return (
    <section
      id="features"
      className="mx-auto max-w-6xl scroll-mt-20 px-6 py-24 sm:py-32"
    >
      <div className="grid min-w-0 gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
        <div className="min-w-0">
          <Reveal>
            <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Features
            </p>
            <h2 className="font-bold text-4xl leading-tight tracking-tight sm:text-5xl">
              Everything local, nothing in the way.
            </h2>
          </Reveal>

          <ul className="mt-8">
            {features.map((feature, i) => (
              <FeatureItem key={feature.title} feature={feature} index={i} />
            ))}
          </ul>
        </div>

        <Reveal delay={0.1} className="min-w-0">
          <FeatureDemo />
        </Reveal>
      </div>
    </section>
  );
}
