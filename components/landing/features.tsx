import {
  FileVideo,
  Keyboard,
  Mic,
  Scissors,
  ShieldCheck,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { Reveal } from "@/components/landing/reveal";

interface Feature {
  icon: LucideIcon;
  title: string;
  body: string;
  wide?: boolean;
}

const features: Feature[] = [
  {
    icon: ShieldCheck,
    title: "Nothing leaves your browser",
    body: "The recording is built as a local file and downloaded to you. There's no backend for your media — nothing is ever uploaded.",
    wide: true,
  },
  {
    icon: Zap,
    title: "No account, ever",
    body: "Open the tab and record. No sign-up, no watermark.",
  },
  {
    icon: Mic,
    title: "Voice + system sound",
    body: "Mix in your microphone; capture system audio where the browser allows.",
  },
  {
    icon: Scissors,
    title: "Edit it in-browser",
    body: "A multi-cut timeline with filmstrip, per-segment mute and speed, undo/redo — all on your machine.",
    wide: true,
  },
  {
    icon: FileVideo,
    title: "mp4 or webm",
    body: "mp4 when the browser can encode it, webm everywhere else.",
  },
  {
    icon: Keyboard,
    title: "Keyboard-driven",
    body: "R to record, S to stop, Space, Ctrl+Z — the fast paths are bound.",
    wide: true,
  },
];

export function Features() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
      <Reveal className="mb-14 max-w-xl">
        <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Features
        </p>
        <h2 className="font-bold text-4xl leading-tight tracking-tight sm:text-5xl">
          Everything local, nothing in the way.
        </h2>
      </Reveal>

      <div className="grid gap-4 md:grid-cols-3">
        {features.map((feature, i) => {
          const Icon = feature.icon;
          return (
            <Reveal
              key={feature.title}
              delay={(i % 3) * 0.06}
              className={cn(feature.wide && "md:col-span-2")}
            >
              <div className="flex h-full flex-col gap-4 rounded-xl border border-border bg-surface p-6">
                <span className="grid size-10 place-items-center rounded-lg bg-red/10 text-red">
                  <Icon className="size-5" />
                </span>
                <div className="space-y-1.5">
                  <h3 className="font-bold text-xl">{feature.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {feature.body}
                  </p>
                </div>
              </div>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}
