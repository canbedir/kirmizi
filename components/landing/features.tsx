import {
  FileVideo,
  Keyboard,
  Mic,
  Scissors,
  ShieldCheck,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Reveal } from "@/components/landing/reveal";
import { FeatureDemo } from "@/components/landing/feature-demo";

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

export function Features() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
      <div className="grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
        <Reveal>
          <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Features
          </p>
          <h2 className="font-bold text-4xl leading-tight tracking-tight sm:text-5xl">
            Everything local, nothing in the way.
          </h2>

          <ul className="mt-9 space-y-5">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <li key={feature.title} className="flex items-start gap-3.5">
                  <span className="mt-0.5 grid size-8 flex-none place-items-center rounded-lg bg-red/10 text-red">
                    <Icon className="size-4" />
                  </span>
                  <div>
                    <p className="font-bold">{feature.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {feature.body}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </Reveal>

        <Reveal delay={0.1}>
          <FeatureDemo />
        </Reveal>
      </div>
    </section>
  );
}
