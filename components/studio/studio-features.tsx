"use client";

import {
  AudioLines,
  Crop,
  Focus,
  Frame,
  Gauge,
  History,
  MousePointerClick,
  Scissors,
  UserRound,
  Volume2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Reveal } from "@/components/landing/reveal";

const EASE = [0.22, 1, 0.36, 1] as const;

interface Item {
  icon: LucideIcon;
  title: string;
  body: string;
}

const items: Item[] = [
  {
    icon: Focus,
    title: "Zooms it places itself",
    body: "Clicks are grouped by where and when they happened, so each gets its own push-in and the frame goes flat in between.",
  },
  {
    icon: MousePointerClick,
    title: "Clicks you can see",
    body: "A halo, an impact, and a ring that expands and thins — landing exactly where the pointer did, on light interfaces and dark.",
  },
  {
    icon: AudioLines,
    title: "A level you don't have to judge",
    body: "The clip is measured the way broadcasters measure it and moved onto -16 LUFS by exactly the difference — and held back if reaching it would clip.",
  },
  {
    icon: Scissors,
    title: "Dead air, taken out",
    body: "Stretches that are both quiet and motionless are found and offered up. One press, and Ctrl+Z if you disagree.",
  },
  {
    icon: Crop,
    title: "Vertical and square exports",
    body: "A wide capture keeps its proportions inside a taller frame, with the background filling the room around it.",
  },
  {
    icon: Frame,
    title: "A frame worth the shot",
    body: "Background presets, padding, rounded corners and shadow — rendered into the file, not faked in the preview.",
  },
  {
    icon: UserRound,
    title: "A camera you can move later",
    body: "The webcam records as its own track, so the bubble's position, shape and border stay editable after the take.",
  },
  {
    icon: Volume2,
    title: "Clicks you can hear",
    body: "An optional click, synthesised rather than sampled, mixed in on the video's own clock.",
  },
  {
    icon: History,
    title: "Come back to it later",
    body: "Cuts, zooms, the frame and the sound settings are kept beside the recording, so closing the tab isn't losing the work.",
  },
  {
    icon: Gauge,
    title: "Exports faster than it plays",
    body: "Frames are decoded and re-encoded rather than recorded off playback, so a ten-minute clip doesn't take ten minutes — and every frame is accounted for.",
  },
];

function FeatureItem({ item, index }: { item: Item; index: number }) {
  const reduce = useReducedMotion();
  const Icon = item.icon;

  return (
    <motion.li
      className="flex items-start gap-3.5 border-b border-border py-5 last:border-b-0"
      initial={reduce ? undefined : { opacity: 0, x: -12 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, amount: 0.5 }}
      transition={{ delay: (index % 3) * 0.07, duration: 0.5, ease: EASE }}
    >
      <span className="mt-0.5 grid size-8 flex-none place-items-center rounded-lg bg-red/10 text-red">
        <Icon className="size-4" />
      </span>
      <div>
        <p className="font-bold">{item.title}</p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          {item.body}
        </p>
      </div>
    </motion.li>
  );
}

export function StudioFeatures() {
  const half = Math.ceil(items.length / 2);

  return (
    <section className="mx-auto max-w-6xl px-6 py-24 sm:py-28">
      <Reveal className="mb-10 max-w-2xl">
        <p className="mb-3 font-mono text-xs tracking-[0.2em] text-muted-foreground uppercase">
          What you get
        </p>
        <h2 className="font-bold text-4xl leading-tight tracking-tight sm:text-5xl">
          The finishing, done for you.
        </h2>
        <p className="mt-4 text-lg text-muted-foreground text-pretty">
          Everything here is applied when the clip is exported, on your machine.
          Nothing is baked in at capture time, so every decision stays yours to
          change.
        </p>
      </Reveal>

      <div className="grid gap-x-14 sm:grid-cols-2">
        <ul>
          {items.slice(0, half).map((item, i) => (
            <FeatureItem key={item.title} item={item} index={i} />
          ))}
        </ul>
        <ul>
          {items.slice(half).map((item, i) => (
            <FeatureItem key={item.title} item={item} index={i} />
          ))}
        </ul>
      </div>
    </section>
  );
}
