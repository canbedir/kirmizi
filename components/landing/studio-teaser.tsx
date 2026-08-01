"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Reveal } from "@/components/landing/reveal";

// A door to the studio page, for people whose recordings need more than a
// trim. It shows the thing rather than describing it, but stays quieter than
// the hero: the simple path is still the default one.

const SCALE = 1.7;
const ARRIVE = 0.7; // the pointer lands — and the click with it
const IN_END = 1.25;
const HOLD_END = 2.0;
const CYCLE = 2.7;

// Centres of real elements in the mock, both inside what 1.7× can frame
// without running off an edge.
const TARGETS = [
  { x: 0.365, y: 0.37 }, // the first card
  { x: 0.619, y: 0.689 }, // the button in the panel
];
const TOTAL = TARGETS.length * CYCLE;

const TRAVEL = [0.4, 0, 0.2, 1] as const;
const PUSH = [0.22, 1, 0.36, 1] as const;

const shift = (f: number, s: number) =>
  s === 1 ? "0%" : `${(0.5 - f * s) * 100}%`;

function ClickMark({ at, beat }: { at: { x: number; y: number }; beat: number }) {
  // The keyframe just before the beat keeps the mark hidden until the click;
  // without it the opacity ramps up from the top of the loop.
  const hold = Math.max(0, beat - 0.006);
  return (
    <motion.span
      aria-hidden
      className="absolute rounded-full border-2 border-white"
      style={{
        left: `${at.x * 100}%`,
        top: `${at.y * 100}%`,
        translate: "-50% -50%",
        width: "9%",
        aspectRatio: "1",
      }}
      animate={{
        opacity: [0, 0, 0.95, 0, 0],
        scale: [0.35, 0.35, 0.5, 1.7, 1.7],
      }}
      transition={{
        duration: TOTAL,
        times: [0, hold, beat, beat + 0.07, 1],
        repeat: Infinity,
        ease: "easeOut",
      }}
    />
  );
}

/** A small screen that pushes in on each click, on a short loop. */
function MiniDemo() {
  const reduce = useReducedMotion();

  const timeline = useMemo(() => {
    interface Key {
      t: number;
      scale: number;
      p: { x: number; y: number };
      press?: boolean;
    }
    // Start where the loop ends, so the wrap is invisible.
    const keys: Key[] = [
      { t: 0, scale: 1, p: TARGETS[TARGETS.length - 1] },
    ];
    TARGETS.forEach((target, i) => {
      const base = i * CYCLE;
      keys.push({ t: base + ARRIVE, scale: 1, p: target, press: true });
      keys.push({ t: base + IN_END, scale: SCALE, p: target });
      keys.push({ t: base + HOLD_END, scale: SCALE, p: target });
      keys.push({ t: base + CYCLE, scale: 1, p: target });
    });

    return {
      times: keys.map((k) => k.t / TOTAL),
      ease: keys.slice(1).map((k, i) => (k.p === keys[i].p ? PUSH : TRAVEL)),
      frame: {
        scale: keys.map((k) => k.scale),
        x: keys.map((k) => shift(k.p.x, k.scale)),
        y: keys.map((k) => shift(k.p.y, k.scale)),
      },
      pointer: {
        left: keys.map((k) => `${k.p.x * 100}%`),
        top: keys.map((k) => `${k.p.y * 100}%`),
        scale: keys.map((k) => (k.press ? 0.86 : 1)),
      },
      beats: TARGETS.map((_, i) => (i * CYCLE + ARRIVE) / TOTAL),
    };
  }, []);

  const loop = {
    duration: TOTAL,
    times: timeline.times,
    ease: timeline.ease,
    repeat: Infinity,
  };

  return (
    <div className="relative aspect-16/10 w-full overflow-hidden rounded-lg border border-border bg-black">
      <motion.div
        className="absolute inset-0 origin-top-left"
        animate={reduce ? undefined : timeline.frame}
        transition={loop}
      >
        <div className="absolute inset-0 bg-[#f7f6f3]">
          <div className="absolute inset-y-0 left-0 w-[15%] bg-[#15130f]">
            <div className="mt-[9%] ml-[16%] h-[5%] w-[56%] rounded-sm bg-red" />
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="mt-[10%] ml-[16%] h-[4%] rounded-sm bg-white/15"
                style={{ width: `${66 - i * 16}%` }}
              />
            ))}
          </div>
          <div className="absolute inset-x-[15%] top-0 h-[15%] bg-white" />

          {/* Two cards; the first is a target. */}
          {[0.2, 0.58].map((left) => (
            <div
              key={left}
              className="absolute top-[24%] h-[26%] w-[33%] rounded-md bg-white"
              style={{ left: `${left * 100}%` }}
            >
              <div className="absolute top-[18%] left-[10%] h-[13%] w-[54%] rounded-sm bg-[#e9e6df]" />
              <div className="absolute top-[42%] left-[24%] h-[26%] w-[52%] rounded-sm bg-[#15130f]" />
            </div>
          ))}

          <div className="absolute top-[58%] right-[9%] bottom-[9%] left-[20%] rounded-md bg-white">
            <div className="absolute top-[14%] left-[7%] h-[12%] w-[30%] rounded-sm bg-[#eceae4]" />
            <div className="absolute top-[21%] left-[44%] h-[24%] w-[30%] rounded-md bg-red" />
            <div className="absolute top-[58%] left-[7%] h-[10%] w-[64%] rounded-sm bg-[#eceae4]" />
            <div className="absolute top-[76%] left-[7%] h-[10%] w-[44%] rounded-sm bg-[#eceae4]" />
          </div>
        </div>

        {!reduce && (
          <>
            {TARGETS.map((target, i) => (
              <ClickMark key={i} at={target} beat={timeline.beats[i]} />
            ))}
            <motion.div
              className="absolute origin-top-left"
              style={{ width: "5%" }}
              animate={timeline.pointer}
              transition={loop}
            >
              <svg viewBox="0 0 12 18" aria-hidden className="h-auto w-full">
                <path
                  d="M0 0 L0 13.5 L3.4 10.4 L5.6 15.3 L7.6 14.4 L5.4 9.5 L9.5 9.5 Z"
                  fill="#fff"
                  stroke="rgba(20,18,16,0.85)"
                  strokeWidth="1"
                  strokeLinejoin="round"
                />
              </svg>
            </motion.div>
          </>
        )}
      </motion.div>
    </div>
  );
}

export function StudioTeaser() {
  return (
    <section className="mx-auto max-w-6xl px-6 pb-8">
      <Reveal>
        <Link
          href="/studio"
          className="group relative block overflow-hidden rounded-2xl border border-border bg-surface/40 p-6 transition-colors hover:border-red/40 sm:p-9"
        >
          {/* Brand glow, brought up as the card is considered. */}
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 -right-16 h-72 w-96 rounded-full opacity-40 blur-3xl transition-opacity duration-500 group-hover:opacity-80"
            style={{
              background:
                "radial-gradient(50% 50% at 50% 50%, var(--glow), transparent 70%)",
            }}
          />

          <div className="relative grid items-center gap-8 sm:grid-cols-[1fr_18rem] sm:gap-10">
            <div>
              <p className="relative mb-3 inline-block font-mono text-xs tracking-[0.2em] text-red uppercase">
                Studio
                <span className="absolute -top-3.5 left-[90%] -translate-x-1/2 rotate-12 font-serif text-sm tracking-normal text-red normal-case italic">
                  new
                </span>
              </p>
              <p className="font-bold text-2xl leading-tight tracking-tight text-balance sm:text-3xl">
                Recording something you&apos;ll show people?
              </p>
              <p className="mt-3 max-w-md leading-relaxed text-muted-foreground">
                It places the zooms for you, from where you clicked — eased in,
                held, and let go — then marks the clicks while it&apos;s at it.
              </p>
              <span className="mt-6 inline-flex items-center gap-2 font-mono text-sm text-foreground">
                See the studio
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </span>
            </div>

            <MiniDemo />
          </div>
        </Link>
      </Reveal>
    </section>
  );
}
