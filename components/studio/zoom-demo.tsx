"use client";

import { useMemo } from "react";
import { motion, useReducedMotion } from "motion/react";

// A loop of what the editor does on its own: the pointer travels, lands on
// something, the click is marked, and the frame eases in before letting go.
// Everything is markup — no video, no images, so it costs nothing to ship.

const SCALE = 1.9;

// Beats within one target's turn, in seconds.
const ARRIVE = 0.75; // pointer reaches it — the click lands here
const IN_END = 1.35; // fully pushed in
const HOLD_END = 2.15; // held
const CYCLE = 2.65; // and back out, ready for the next

// Four things worth clicking, as fractions of the frame. Each is the centre
// of a real element in the mock below, and each sits inside the range a 1.9×
// crop can reach without running off an edge.
const TARGETS = [
  { x: 0.305, y: 0.28 }, // the block inside the first card
  { x: 0.555, y: 0.28 }, // and the second
  { x: 0.343, y: 0.682 }, // primary button
  { x: 0.54, y: 0.682 }, // the action beside it
];

const TOTAL = TARGETS.length * CYCLE;

const TRAVEL = [0.4, 0, 0.2, 1] as const; // a hand speeding up, then settling
const PUSH = [0.22, 1, 0.36, 1] as const; // the site's own ease, for the zoom

interface Key {
  t: number;
  scale: number;
  p: { x: number; y: number };
  /** True on the frame the click lands, for the pointer's press. */
  press?: boolean;
}

function Pointer({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 18" className={className} aria-hidden>
      <path
        d="M0 0 L0 13.5 L3.4 10.4 L5.6 15.3 L7.6 14.4 L5.4 9.5 L9.5 9.5 Z"
        fill="#fff"
        stroke="rgba(20,18,16,0.85)"
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * The click, in the same three layers the exporter draws: a halo for
 * legibility, a core that reads as impact, and a ring that expands and thins.
 */
function ClickMark({ at, beat }: { at: { x: number; y: number }; beat: number }) {
  const common = {
    duration: TOTAL,
    repeat: Infinity,
    ease: "easeOut" as const,
  };
  const place = {
    left: `${at.x * 100}%`,
    top: `${at.y * 100}%`,
    translate: "-50% -50%",
  };

  // The keyframe just before the beat is what keeps the mark hidden until
  // the click: without it the opacity ramps up from the top of the loop and
  // the effect appears seconds early.
  const hold = Math.max(0, beat - 0.004);

  return (
    <>
      <motion.span
        aria-hidden
        className="absolute rounded-full bg-white/70 blur-md"
        style={{ ...place, width: "7%", aspectRatio: "1" }}
        animate={{
          opacity: [0, 0, 0.5, 0, 0],
          scale: [0.6, 0.6, 1.5, 1.9, 1.9],
        }}
        transition={{ ...common, times: [0, hold, beat, beat + 0.055, 1] }}
      />
      <motion.span
        aria-hidden
        className="absolute rounded-full bg-white"
        style={{ ...place, width: "2.6%", aspectRatio: "1" }}
        animate={{
          opacity: [0, 0, 0.75, 0, 0],
          scale: [0.7, 0.7, 1, 0.6, 0.6],
        }}
        transition={{ ...common, times: [0, hold, beat, beat + 0.022, 1] }}
      />
      <motion.span
        aria-hidden
        className="absolute rounded-full border-2 border-white"
        style={{ ...place, width: "5%", aspectRatio: "1" }}
        animate={{
          opacity: [0, 0, 0.95, 0, 0],
          scale: [0.35, 0.35, 0.5, 1.7, 1.7],
        }}
        transition={{ ...common, times: [0, hold, beat, beat + 0.06, 1] }}
      />
    </>
  );
}

/** A plausible app behind the demo, built from blocks. */
function MockApp() {
  return (
    <div className="absolute inset-0 bg-[#f7f6f3]">
      {/* sidebar */}
      <div className="absolute inset-y-0 left-0 w-[16%] bg-[#15130f]">
        <div className="mt-[7%] ml-[14%] h-[3.5%] w-[52%] rounded-sm bg-red" />
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="mt-[7%] ml-[14%] h-[2.6%] rounded-sm bg-white/15"
            style={{ width: `${64 - (i % 3) * 14}%` }}
          />
        ))}
      </div>

      {/* header */}
      <div className="absolute inset-x-[16%] top-0 h-[11%] bg-white">
        <div className="absolute top-[38%] left-[4%] h-[22%] w-[22%] rounded-sm bg-[#e5e2db]" />
        <div className="absolute top-[32%] right-[4%] h-[34%] w-[14%] rounded-full bg-[#e9e6df]" />
      </div>

      {/* cards — the first two are targets */}
      {[0.19, 0.44, 0.69].map((left) => (
        <div
          key={left}
          className="absolute top-[16%] h-[26%] rounded-md bg-white"
          style={{ left: `${left * 100}%`, width: "23%" }}
        >
          <div className="absolute top-[14%] left-[10%] h-[10%] w-[52%] rounded-sm bg-[#e9e6df]" />
          {/* Centred in the card, so the pointer's target is its middle. */}
          <div className="absolute top-[34%] left-[25%] h-[24%] w-[50%] rounded-sm bg-[#15130f]" />
          <div className="absolute bottom-[14%] left-[10%] h-[8%] w-[74%] rounded-sm bg-[#eceae4]" />
        </div>
      ))}

      {/* main panel — its two actions are the other targets */}
      <div className="absolute top-[48%] right-[8%] bottom-[8%] left-[19%] rounded-md bg-white">
        {[10, 24, 62, 76].map((top, i) => (
          <div
            key={top}
            className="absolute left-[5%] h-[7%] rounded-sm bg-[#eceae4]"
            style={{ top: `${top}%`, width: `${76 - (i % 3) * 18}%` }}
          />
        ))}
        <div className="absolute top-[38%] left-[8%] h-[16%] w-[26%] rounded-md bg-red" />
        <div className="absolute top-[38%] left-[38%] h-[16%] w-[20%] rounded-md border border-[#dedbd3] bg-[#f4f2ee]" />
      </div>
    </div>
  );
}

export function ZoomDemo() {
  const reduce = useReducedMotion();

  const timeline = useMemo(() => {
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

    const times = keys.map((k) => k.t / TOTAL);
    // A translate of zero at rest; once magnified, whatever brings the target
    // to the middle of the frame.
    const shift = (f: number, s: number) =>
      s === 1 ? "0%" : `${(0.5 - f * s) * 100}%`;

    return {
      times,
      // One easing per transition: travel gets a hand-like curve, the zoom
      // gets the site's.
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
    <div className="relative overflow-hidden rounded-xl border border-border bg-black shadow-[0_30px_90px_-40px_rgba(0,0,0,0.7)]">
      <div className="relative aspect-video">
        <motion.div
          className="absolute inset-0 origin-top-left"
          animate={reduce ? undefined : timeline.frame}
          transition={loop}
        >
          <MockApp />

          {!reduce && (
            <>
              {TARGETS.map((target, i) => (
                <ClickMark key={i} at={target} beat={timeline.beats[i]} />
              ))}
              {/* The arrow's tip is its own origin, so left/top place it exactly. */}
              <motion.div
                className="absolute origin-top-left"
                style={{ width: "2.6%" }}
                animate={timeline.pointer}
                transition={loop}
              >
                <Pointer className="h-auto w-full drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]" />
              </motion.div>
            </>
          )}
        </motion.div>
      </div>

      {/* A live badge, so it reads as a recording rather than a screenshot. */}
      <div className="pointer-events-none absolute top-3 left-3 inline-flex items-center gap-2 rounded-full border border-border bg-background/70 px-2.5 py-1 backdrop-blur-md">
        <span className="record-dot record-dot--live size-2" aria-hidden />
        <span className="font-mono text-[11px] text-foreground">auto zoom</span>
      </div>
    </div>
  );
}
