"use client";

import { useMemo, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

// Why a stretch gets cut, drawn rather than described.
//
// The rule is the hard part to put in a sentence: silence alone would take a
// whole silent demo, and an idle pointer alone would take the moment someone
// stops moving the mouse to explain something. Both have to agree. Two lanes
// and a verdict make that obvious in a way a paragraph doesn't — the two
// stretches that survive sit right next to the one that goes.
//
// Everything is markup: no video, no images, nothing to download.

/** The stretches of an imagined recording, and what was going on in each. */
const REGIONS = [
  { span: 20, sound: true, pointer: true },
  { span: 20, sound: false, pointer: true },
  { span: 18, sound: true, pointer: false },
  { span: 27, sound: false, pointer: false }, // the only dead one
  { span: 15, sound: true, pointer: true },
] as const;

const TOTAL_SPAN = REGIONS.reduce((sum, r) => sum + r.span, 0);
const isDead = (r: (typeof REGIONS)[number]) => !r.sound && !r.pointer;
/** Bars per unit of span, so every region is drawn at the same density. */
const DENSITY = 0.55;

/* The loop, in seconds. */
const SCAN_END = 2.2; // the sweep finishes
const MARK_END = 2.9; // the dead stretch is marked
const CLOSE_END = 3.7; // and lifted out
const HOLD_END = 5.3; // the tightened result sits there
const TOTAL = 6.4; // then it comes back

const at = (t: number) => t / TOTAL;
const EASE = [0.22, 1, 0.36, 1] as const;

/** Deterministic, so the shape is the same on every machine and every render. */
function noise(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Heights for one region's bars: lively when active, near-flat when not.
 *
 * Rounded, and not for tidiness: a full-precision percentage in an inline
 * style is normalised by the browser when it parses the attribute, so the
 * server's "44.954532884838585%" becomes "44.9545%" and every bar hydrates
 * as a mismatch.
 */
function bars(seed: number, active: boolean, count: number): number[] {
  return Array.from({ length: count }, (_, i) => {
    const n = noise(seed * 97 + i * 13);
    const m = noise(seed * 41 + i * 7);
    // A floor of movement even in the quiet parts — a recording is never
    // digitally silent, and pretending otherwise looks fake.
    const height = active ? 0.3 + n * 0.6 * (0.55 + m * 0.45) : 0.06 + n * 0.06;
    return Math.round(height * 10_000) / 10_000;
  });
}

/** Where a region starts and ends, as fractions of the whole strip. */
function bounds(index: number): [number, number] {
  let before = 0;
  for (let i = 0; i < index; i++) before += REGIONS[i].span;
  return [before / TOTAL_SPAN, (before + REGIONS[index].span) / TOTAL_SPAN];
}

export function PaceDemo() {
  const reduce = useReducedMotion();

  const lanes = useMemo(
    () =>
      REGIONS.map((region, i) => {
        const count = Math.max(3, Math.round(region.span * DENSITY));
        return {
          span: region.span,
          dead: isDead(region),
          sound: bars(i, region.sound, count),
          pointer: bars(i + 50, region.pointer, count),
        };
      }),
    [],
  );

  const loop = { duration: TOTAL, repeat: Infinity };

  /** A region's share of the strip, which drops to nothing when it's cut. */
  const share = (index: number) => {
    const { span } = REGIONS[index];
    if (reduce || !isDead(REGIONS[index])) return undefined;
    return {
      animate: { flexGrow: [span, span, 0, 0, span] },
      transition: {
        ...loop,
        ease: EASE,
        times: [0, at(MARK_END), at(CLOSE_END), at(HOLD_END), 1],
      },
    };
  };

  /** Rows share one set of children so the three lanes stay in step. */
  const row = (
    render: (lane: (typeof lanes)[number], i: number) => ReactNode,
    wash = false,
  ) =>
    lanes.map((lane, i) => {
      const motionProps = share(i);
      const [, to] = bounds(i);
      return (
        <motion.div
          key={i}
          className="relative flex min-w-0 items-stretch gap-px overflow-hidden"
          style={{ flexGrow: lane.span, flexBasis: 0 }}
          {...motionProps}
        >
          {render(lane, i)}
          {/* The verdict reaching this region is what colours it, so the
              answer arrives with the sweep rather than before it. */}
          {wash && lane.dead && !reduce && (
            <motion.span
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-sm bg-red/25"
              animate={{ opacity: [0, 0, 1, 1, 0, 0] }}
              transition={{
                ...loop,
                ease: "linear",
                times: [
                  0,
                  at(SCAN_END * to - 0.15),
                  at(SCAN_END * to + 0.1),
                  at(HOLD_END),
                  at(HOLD_END + 0.35),
                  1,
                ],
              }}
            />
          )}
        </motion.div>
      );
    });

  const bar = (heights: number[], floor: boolean) =>
    heights.map((height, k) => (
      <span
        key={k}
        className="min-w-0 flex-1 rounded-full bg-muted-foreground/40"
        style={{
          height: `${Math.max(5, Math.round(height * 10_000) / 100)}%`,
          alignSelf: floor ? "flex-end" : "center",
        }}
      />
    ));

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface/60 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-4 pb-4">
        <span className="font-mono text-[11px] tracking-[0.15em] text-muted-foreground uppercase">
          Pace
        </span>
        <motion.span
          className="font-mono text-[11px] text-red"
          animate={reduce ? undefined : { opacity: [0, 0, 1, 1, 0, 0] }}
          transition={{
            ...loop,
            ease: "linear",
            times: [
              0,
              at(SCAN_END),
              at(MARK_END),
              at(HOLD_END),
              at(HOLD_END + 0.35),
              1,
            ],
          }}
        >
          −4.9s of dead air
        </motion.span>
      </div>

      <div className="flex gap-3">
        <div className="flex w-14 shrink-0 flex-col gap-2 text-right font-mono text-[10px] text-muted-foreground">
          <span className="flex h-10 items-center justify-end">sound</span>
          <span className="flex h-10 items-center justify-end">pointer</span>
          <span className="h-1" />
        </div>

        <div className="relative min-w-0 flex-1">
          <div className="flex flex-col gap-2">
            {/* Audio reads as a waveform about a centre line… */}
            <div className="flex h-10 items-stretch gap-px">
              {row((lane) => bar(lane.sound, false), true)}
            </div>
            {/* …and movement grows off the floor, so the two don't blur together. */}
            <div className="flex h-10 items-stretch gap-px">
              {row((lane) => bar(lane.pointer, true), true)}
            </div>

            {/* The verdict, lit only where both lanes agree nothing is going on. */}
            <div className="flex h-1 items-stretch gap-px">
              {row((lane, i) => {
                const [from, to] = bounds(i);
                return (
                  <motion.span
                    key="v"
                    className={`h-full w-full origin-left rounded-full ${
                      lane.dead ? "bg-red" : "bg-border"
                    }`}
                    animate={
                      reduce ? undefined : { scaleX: [0, 0, 1, 1, 0, 0] }
                    }
                    transition={{
                      ...loop,
                      ease: "linear",
                      // Fills as the sweep passes over this region, and clears
                      // again when the strip reopens.
                      times: [
                        0,
                        at(SCAN_END * from),
                        at(SCAN_END * to),
                        at(HOLD_END),
                        at(HOLD_END + 0.35),
                        1,
                      ],
                    }}
                  />
                );
              })}
            </div>
          </div>

          {/* The sweep, inside the strip so it starts where the bars do. */}
          {!reduce && (
            <motion.span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 w-px bg-red/70"
              style={{ boxShadow: "0 0 12px var(--glow)" }}
              animate={{ left: ["0%", "100%", "100%", "0%"], opacity: [1, 1, 0, 0] }}
              transition={{
                ...loop,
                ease: [0.4, 0, 0.2, 1],
                times: [0, at(SCAN_END), at(SCAN_END + 0.3), 1],
              }}
            />
          )}
        </div>
      </div>

      <p className="mt-4 pl-17 font-mono text-[11px] leading-relaxed text-muted-foreground">
        quiet <span className="text-foreground">and</span> parked — never either
        on its own
      </p>
    </div>
  );
}
