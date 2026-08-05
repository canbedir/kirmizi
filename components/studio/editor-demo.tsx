"use client";

import { motion, useReducedMotion } from "motion/react";

// The editor as it stands the moment recording stops: the zooms are already
// on the timeline, and they're ordinary regions you can take hold of.
//
// A screenshot said the same thing, but a still can't show the second half —
// that they're yours. So the loop places them, picks one up, re-aims it, and
// shows what that framing actually gets you.

// Far enough to read as a push-in, near enough that the frame still has an
// interface in it rather than two shapes.
const SCALE = 1.55;

/* The loop, in seconds. */
const LAND = 0.35; // the first zoom lands
const STEP = 0.2; // and the rest follow
const SELECT = 1.5; // one is picked up
const AIM_START = 2.2; // and re-aimed
const AIM_END = 3.3;
const PUSH_START = 3.8; // then the frame shows what that gets you
const PUSH_END = 4.6;
const HOLD_END = 5.9;
const OUT_END = 6.7; // and lets go
const TOTAL = 7.8;

const at = (t: number) => t / TOTAL;
const EASE = [0.22, 1, 0.36, 1] as const;
const TRAVEL = [0.4, 0, 0.2, 1] as const;

/** The zooms it placed, as fractions of the timeline. */
const PILLS = [
  { left: 5, width: 13, scale: "3.0×" },
  { left: 24, width: 11, scale: "1.6×" },
  { left: 43, width: 16, scale: "1.9×" },
  { left: 68, width: 22, scale: "2.2×" },
];
const PICKED = 2;

/**
 * Where the picked zoom is aimed, before and after — fractions of the frame.
 * The second has to sit inside what the crop can reach at this scale, which
 * is the middle 1/SCALE of each axis.
 */
const AIM = [
  { x: 0.33, y: 0.33, w: 0.23, h: 0.21 },
  { x: 0.438, y: 0.636, w: 0.14, h: 0.11 },
];

/** Translate that brings a focal point to the middle, or nothing at rest. */
const shift = (f: number, s: number) =>
  s === 1 ? "0%" : `${(0.5 - f * s) * 100}%`;

/**
 * A plausible app behind the demo, built from blocks.
 *
 * Denser than it looks like it needs to be: the frame pushes in on part of
 * it, and a sparse mock magnified is just shapes. The rail is kept well off
 * black so it reads as part of the picture rather than as the space around it.
 */
function MiniApp() {
  return (
    <div className="absolute inset-0 bg-[#f7f6f3]">
      {/* rail */}
      <div className="absolute inset-y-0 left-0 w-[15%] bg-[#2b241d]">
        <div className="mt-[5%] ml-[12%] h-[3.5%] w-[50%] rounded-sm bg-red" />
        <div className="mt-[6%] ml-[12%] h-px w-[64%] bg-white/10" />
        {[0, 1, 2, 3, 4].map((i) => (
          // An explicit height: percentage heights inside a flex row with none
          // of its own resolve against zero and vanish.
          <div
            key={i}
            className="mt-[6%] ml-[12%] flex h-[3%] items-center gap-[6%]"
          >
            <span className="h-full w-[11%] rounded-[1px] bg-white/30" />
            <span
              className="h-full rounded-[1px] bg-white/16"
              style={{ width: `${44 - (i % 3) * 10}%` }}
            />
          </div>
        ))}
      </div>

      {/* header */}
      <div className="absolute inset-x-[15%] top-0 h-[12%] border-b border-[#e5e2db] bg-white">
        <div className="absolute top-[32%] left-[4%] h-[34%] w-[26%] rounded-sm bg-[#eeebe4]" />
        <div className="absolute top-[36%] right-[16%] h-[26%] w-[9%] rounded-sm bg-[#e5e2db]" />
        <div className="absolute top-[28%] right-[4%] h-[42%] w-[8%] rounded-full bg-[#e0dcd3]" />
      </div>

      {/* cards */}
      {[0.185, 0.45, 0.715].map((left) => (
        <div
          key={left}
          className="absolute top-[17%] h-[21%] w-[22%] rounded-md bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
          style={{ left: `${left * 100}%` }}
        >
          <div className="absolute top-[12%] left-[9%] h-[10%] w-[48%] rounded-[1px] bg-[#e9e6df]" />
          <div className="absolute top-[32%] left-[9%] h-[24%] w-[46%] rounded-sm bg-[#1c1712]" />
          <div className="absolute top-[68%] left-[9%] h-[8%] w-[70%] rounded-[1px] bg-[#eceae4]" />
          <div className="absolute top-[82%] left-[9%] h-[8%] w-[42%] rounded-[1px] bg-[#eceae4]" />
        </div>
      ))}

      {/* panel — its primary action is what the zoom ends up on */}
      <div className="absolute top-[43%] right-[6%] bottom-[6%] left-[18.5%] rounded-md bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
        <div className="absolute top-[7%] left-[4%] h-[8%] w-[30%] rounded-[1px] bg-[#e5e2db]" />
        <div className="absolute top-[7%] right-[4%] h-[8%] w-[12%] rounded-[1px] bg-[#eceae4]" />
        <div className="absolute top-[24%] left-[4%] h-px w-[92%] bg-[#eceae4]" />

        {/* the two actions */}
        <div className="absolute top-[33%] left-[4%] h-[15%] w-[19%] rounded-sm bg-red" />
        <div className="absolute top-[33%] left-[26%] h-[15%] w-[15%] rounded-sm border border-[#dedbd3] bg-[#f4f2ee]" />

        {/* a list, so there's something to see at any magnification */}
        {[58, 72, 86].map((top, i) => (
          <div
            key={top}
            className="absolute left-[4%] h-[7%] w-[92%]"
            style={{ top: `${top}%` }}
          >
            <span className="absolute inset-y-0 left-0 aspect-square rounded-full bg-[#e0dcd3]" />
            <span
              className="absolute inset-y-0 left-[5%] rounded-[1px] bg-[#eceae4]"
              style={{ width: `${58 - (i % 3) * 13}%` }}
            />
            <span className="absolute inset-y-0 right-0 w-[8%] rounded-[1px] bg-[#f0eee9]" />
          </div>
        ))}
      </div>
    </div>
  );
}

const CHIPS = ["Split", "Delete", "Mute", "1×"];

export function EditorDemo() {
  const reduce = useReducedMotion();
  const loop = { duration: TOTAL, repeat: Infinity };

  // The frame: flat, then pushed in on wherever the zoom ended up aimed.
  const frame = {
    scale: [1, 1, SCALE, SCALE, 1, 1],
    x: [
      shift(AIM[0].x, 1),
      shift(AIM[1].x, 1),
      shift(AIM[1].x, SCALE),
      shift(AIM[1].x, SCALE),
      shift(AIM[1].x, 1),
      shift(AIM[1].x, 1),
    ],
    y: [
      shift(AIM[0].y, 1),
      shift(AIM[1].y, 1),
      shift(AIM[1].y, SCALE),
      shift(AIM[1].y, SCALE),
      shift(AIM[1].y, 1),
      shift(AIM[1].y, 1),
    ],
  };
  const frameTiming = {
    ...loop,
    ease: EASE,
    times: [0, at(PUSH_START), at(PUSH_END), at(HOLD_END), at(OUT_END), 1],
  };

  /** The bracket and its dot travel together, from one aim to the other. */
  const aimTiming = {
    ...loop,
    ease: TRAVEL,
    times: [0, at(AIM_START), at(AIM_END), 1],
  };
  const aim = {
    left: [AIM[0].x, AIM[0].x, AIM[1].x, AIM[1].x].map((v) => `${v * 100}%`),
    top: [AIM[0].y, AIM[0].y, AIM[1].y, AIM[1].y].map((v) => `${v * 100}%`),
    width: [AIM[0].w, AIM[0].w, AIM[1].w, AIM[1].w].map((v) => `${v * 100}%`),
    height: [AIM[0].h, AIM[0].h, AIM[1].h, AIM[1].h].map((v) => `${v * 100}%`),
  };
  /** Only on screen while the zoom is selected, so the reset isn't seen. */
  const selected = {
    ...loop,
    ease: "linear" as const,
    times: [0, at(SELECT), at(SELECT + 0.25), at(OUT_END), at(OUT_END + 0.3), 1],
  };
  const appear = { opacity: [0, 0, 1, 1, 0, 0] };

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface/60 p-3 sm:p-4">
      {/* The stage, which is what the export will look like. */}
      <div className="relative aspect-16/10 overflow-hidden rounded-lg bg-black">
        <motion.div
          className="absolute inset-0 origin-top-left"
          animate={reduce ? undefined : frame}
          transition={frameTiming}
        >
          <MiniApp />

          {!reduce && (
            <>
              {/* What the picked zoom is framed on. */}
              <motion.span
                aria-hidden
                className="absolute rounded-md border-2 border-red"
                style={{ translate: "-50% -50%" }}
                animate={{ ...aim, ...appear }}
                transition={{ ...aimTiming, opacity: selected }}
              />
              {/* And the handle you'd drag to move it. */}
              <motion.span
                aria-hidden
                className="absolute size-[3.5%] rounded-full border-2 border-white bg-red shadow-[0_1px_4px_rgba(0,0,0,0.6)]"
                style={{ translate: "-50% -50%" }}
                animate={{ left: aim.left, top: aim.top, ...appear }}
                transition={{ ...aimTiming, opacity: selected }}
              />
            </>
          )}
        </motion.div>
      </div>

      {/* Transport */}
      <div className="mt-3 flex items-center justify-between font-mono text-[10px] text-muted-foreground">
        <span className="tabular-nums">00:07 / 00:24</span>
        <span className="flex items-center gap-2">
          <span className="rounded border border-border px-1">⌘Z</span>
          <span>undo</span>
        </span>
      </div>

      {/* The timeline, where the zooms land. */}
      <div className="relative mt-2 h-9 overflow-hidden rounded-md border border-border bg-background/50">
        <div className="absolute inset-x-1 inset-y-1 flex gap-px overflow-hidden rounded-sm">
          {Array.from({ length: 26 }, (_, i) => (
            <span
              key={i}
              className="flex-1 rounded-[1px] bg-muted-foreground/10"
              style={{ opacity: 0.5 + ((i * 37) % 10) / 20 }}
            />
          ))}
        </div>

        {PILLS.map((pill, i) => {
          const isPicked = i === PICKED;
          const born = at(LAND + i * STEP);
          return (
            <motion.div
              key={i}
              className={`absolute inset-y-1.5 flex items-center justify-center rounded-sm text-[9px] font-mono ${
                isPicked
                  ? "bg-red/30 text-red ring-2 ring-red"
                  : "bg-red/15 text-red/70 ring-1 ring-red/40"
              }`}
              style={{ left: `${pill.left}%`, width: `${pill.width}%` }}
              initial={reduce ? undefined : { opacity: 0, scale: 0.7 }}
              animate={
                reduce ? undefined : { opacity: [0, 0, 1, 1], scale: [0.7, 0.7, 1, 1] }
              }
              transition={{
                ...loop,
                ease: EASE,
                times: [0, born, Math.min(1, born + 0.05), 1],
              }}
            >
              {pill.scale}
            </motion.div>
          );
        })}
      </div>

      {/* The rest of the editor, still where it was. */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {CHIPS.map((chip) => (
          <span
            key={chip}
            className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
          >
            {chip}
          </span>
        ))}
        <span className="rounded border border-red px-1.5 py-0.5 font-mono text-[10px] text-red">
          Zoom
        </span>
        <span className="ml-auto flex gap-1">
          {["#3d100b", "#e9e4d8", "#1f3540", "#2a1a3d"].map((colour) => (
            <span
              key={colour}
              className="size-3.5 rounded border border-border"
              style={{ background: colour }}
            />
          ))}
        </span>
      </div>
    </div>
  );
}
