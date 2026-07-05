"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Download, Scissors } from "lucide-react";
import { formatDuration } from "@/lib/format";

// A few abstract "screen frames" for the filmstrip — no external images.
const FRAMES = [
  { sidebar: true, lines: [0.7, 0.45], accent: 0.3 },
  { sidebar: false, lines: [0.8, 0.6, 0.4], accent: 0 },
  { sidebar: true, lines: [0.55, 0.35], accent: 0.5 },
  { sidebar: false, lines: [0.65, 0.5], accent: 0.25 },
  { sidebar: true, lines: [0.75, 0.4, 0.55], accent: 0 },
  { sidebar: false, lines: [0.5, 0.7], accent: 0.4 },
];

function Frame({ frame }: { frame: (typeof FRAMES)[number] }) {
  return (
    <div className="mr-2 flex h-full flex-none flex-col overflow-hidden rounded-md border border-border bg-linear-to-br from-surface to-background p-1.5 aspect-video">
      <div className="mb-1 flex gap-0.5">
        <span className="size-1 rounded-full bg-muted-foreground/30" />
        <span className="size-1 rounded-full bg-muted-foreground/30" />
        <span className="size-1 rounded-full bg-muted-foreground/30" />
      </div>
      <div className="flex flex-1 gap-1">
        {frame.sidebar && (
          <div className="w-1/4 rounded-sm bg-muted-foreground/10" />
        )}
        <div className="flex flex-1 flex-col justify-center gap-1">
          {frame.lines.map((w, i) => (
            <span
              key={i}
              className="h-1 rounded-full bg-muted-foreground/20"
              style={{ width: `${w * 100}%` }}
            />
          ))}
          {frame.accent > 0 && (
            <span
              className="h-1 rounded-full bg-red/50"
              style={{ width: `${frame.accent * 100}%` }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export function FeatureDemo() {
  const reduce = useReducedMotion();
  const [seconds, setSeconds] = useState(14);

  // A live-feeling timer for the mock recording HUD.
  useEffect(() => {
    if (reduce) return;
    const id = setInterval(() => setSeconds((s) => (s + 1) % 3600), 1000);
    return () => clearInterval(id);
  }, [reduce]);

  const strip = [...FRAMES, ...FRAMES];

  // Cascade the panel's rows in on first view: HUD → filmstrip → timeline → footer.
  const enter = (i: number) => ({
    initial: reduce ? undefined : { opacity: 0, y: 10 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true },
    transition: {
      delay: 0.15 + i * 0.12,
      duration: 0.5,
      ease: [0.22, 1, 0.36, 1] as const,
    },
  });

  return (
    <motion.div
      aria-hidden
      className="relative w-full min-w-0"
      animate={reduce ? undefined : { y: [0, -12, 0] }}
      transition={
        reduce
          ? undefined
          : { duration: 6, repeat: Infinity, ease: "easeInOut" }
      }
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-6 -z-10 rounded-4xl opacity-60 blur-3xl"
        style={{
          background:
            "radial-gradient(55% 55% at 60% 40%, var(--glow), transparent 70%)",
        }}
      />

      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_40px_120px_-50px_rgba(0,0,0,0.6)]">
        {/* Window chrome */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <span className="size-2.5 rounded-full bg-muted-foreground/25" />
          <span className="size-2.5 rounded-full bg-muted-foreground/25" />
          <span className="size-2.5 rounded-full bg-muted-foreground/25" />
          <div className="mx-auto rounded-md bg-background/60 px-3 py-1 font-mono text-[11px] text-muted-foreground">
            kirmizi.app/record
          </div>
        </div>

        <div className="space-y-6 p-6">
          {/* Recording HUD */}
          <motion.div className="flex items-center justify-between" {...enter(0)}>
            <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
              <span className="record-dot record-dot--live size-2" aria-hidden />
              Recording
            </span>
            <span className="font-mono text-2xl tabular-nums">
              {formatDuration(seconds * 1000)}
            </span>
          </motion.div>

          {/* Filmstrip — screen frames scrolling by like footage, fading out
              at the edges instead of hard-clipping */}
          <motion.div
            className="h-16 overflow-hidden rounded-lg"
            style={{
              maskImage:
                "linear-gradient(90deg, transparent, black 10%, black 90%, transparent)",
              WebkitMaskImage:
                "linear-gradient(90deg, transparent, black 10%, black 90%, transparent)",
            }}
            {...enter(1)}
          >
            <motion.div
              className="flex h-full w-max"
              animate={reduce ? undefined : { x: ["0%", "-50%"] }}
              transition={
                reduce
                  ? undefined
                  : { duration: 16, repeat: Infinity, ease: "linear" }
              }
            >
              {strip.map((frame, i) => (
                <Frame key={i} frame={frame} />
              ))}
            </motion.div>
          </motion.div>

          {/* Timeline with a cut + sweeping playhead */}
          <motion.div
            className="relative h-10 overflow-hidden rounded-lg border border-border bg-background/50"
            {...enter(2)}
          >
            <div className="absolute inset-y-1 left-1 w-[38%] rounded-md bg-red/15 ring-1 ring-red/30" />
            <div
              className="absolute inset-y-1 rounded-md bg-red/15 ring-1 ring-red/30"
              style={{ left: "46%", right: "4px" }}
            />
            {/* the cut — hatched like a removed region in the real editor */}
            <div
              className="absolute inset-y-1 left-[38%] w-[8%]"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(155,147,133,0.25) 4px, rgba(155,147,133,0.25) 5px)",
              }}
            />
            <div className="absolute inset-y-0 left-[38%] flex w-[8%] items-center justify-center text-red">
              <Scissors className="size-3.5" />
            </div>
            {/* playhead — plays the kept segments and jumps the cut, like real
                playback, then holds a beat before looping */}
            <motion.span
              className="absolute inset-y-0 w-px bg-red"
              initial={{ left: "2%" }}
              animate={
                reduce
                  ? { left: "30%" }
                  : { left: ["2%", "37%", "47%", "97%", "97%"] }
              }
              transition={
                reduce
                  ? undefined
                  : {
                      duration: 4.5,
                      times: [0, 0.42, 0.45, 0.94, 1],
                      repeat: Infinity,
                      ease: "linear",
                    }
              }
            >
              <span className="absolute -top-1 -left-1 size-2 rounded-full bg-red shadow-[0_0_8px_var(--glow)]" />
            </motion.span>
          </motion.div>

          {/* Download chip */}
          <motion.div className="flex items-center justify-between" {...enter(3)}>
            <span className="font-mono text-xs text-muted-foreground">
              MP4 · stays on your device
            </span>
            {/* pulses once when the playhead finishes its pass (same clock) */}
            <motion.span
              className="inline-flex items-center gap-1.5 rounded-full bg-red px-3 py-1.5 text-xs font-bold text-red-foreground"
              animate={reduce ? {} : { scale: [1, 1, 1.08, 1] }}
              transition={
                reduce
                  ? undefined
                  : {
                      duration: 4.5,
                      times: [0, 0.94, 0.97, 1],
                      repeat: Infinity,
                      ease: "easeInOut",
                    }
              }
            >
              <Download className="size-3.5" />
              Download
            </motion.span>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
