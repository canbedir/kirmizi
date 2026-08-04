"use client";

import { motion, useReducedMotion } from "motion/react";

// A wide capture, asked for the shapes it gets posted in.
//
// The thing worth showing is that the recording doesn't get cropped or
// squashed to fit — it keeps its proportions and the background fills the
// room that opens up around it. That's a picture, not a sentence.

const SHAPES = [
  { label: "16:9", ratio: 16 / 9 },
  { label: "9:16", ratio: 9 / 16 },
  { label: "1:1", ratio: 1 },
  { label: "4:5", ratio: 4 / 5 },
] as const;

/** Seconds each shape is held, and how long the change takes. */
const HOLD = 1.9;
const TOTAL = SHAPES.length * HOLD;
const EASE = [0.22, 1, 0.36, 1] as const;

/** The tallest and widest the frame ever gets, in the box we draw it in. */
const BOX = 190;

function frameSize(ratio: number) {
  return ratio >= 1
    ? { width: BOX, height: BOX / ratio }
    : { width: BOX * ratio, height: BOX };
}

/** The recording, 16:9, contain-fitted with a margin — the same rule as export. */
function pictureSize(ratio: number) {
  const frame = frameSize(ratio);
  const margin = Math.min(frame.width, frame.height) * 0.06;
  const availW = frame.width - margin * 2;
  const availH = frame.height - margin * 2;
  const scale = Math.min(availW / 16, availH / 9);
  return { width: 16 * scale, height: 9 * scale };
}

export function ShapeDemo() {
  const reduce = useReducedMotion();
  const loop = { duration: TOTAL, repeat: Infinity, ease: EASE };

  // Each shape is held, then changes: a pair of keyframes per shape, plus a
  // final one that closes the loop where it opened.
  const STOPS = [
    ...SHAPES.flatMap((_, i) => [
      (i * HOLD) / TOTAL,
      (i * HOLD + HOLD * 0.62) / TOTAL,
    ]),
    1,
  ];
  const keyed = <T,>(pick: (i: number) => T): T[] => [
    ...SHAPES.flatMap((_, i) => [pick(i), pick(i)]),
    pick(0),
  ];

  const frameW = keyed((i) => frameSize(SHAPES[i].ratio).width);
  const frameH = keyed((i) => frameSize(SHAPES[i].ratio).height);
  const picW = keyed((i) => pictureSize(SHAPES[i].ratio).width);
  const picH = keyed((i) => pictureSize(SHAPES[i].ratio).height);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface/60 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-4 pb-4">
        <span className="font-mono text-[11px] tracking-[0.15em] text-muted-foreground uppercase">
          Shape
        </span>
        <div className="flex gap-1.5">
          {SHAPES.map((shape, i) => (
            // Two layers cross-faded rather than an animated colour: motion
            // can't interpolate between CSS variables, it can only snap.
            <span
              key={shape.label}
              className="relative inline-block font-mono text-[10px]"
            >
              <span className="block rounded border border-border px-1.5 py-0.5 text-muted-foreground">
                {shape.label}
              </span>
              <motion.span
                className="absolute inset-0 rounded border border-red px-1.5 py-0.5 text-red"
                initial={{ opacity: i === 0 ? 1 : 0 }}
                animate={reduce ? undefined : { opacity: keyed((k) => (k === i ? 1 : 0)) }}
                transition={{ ...loop, ease: "linear", times: STOPS }}
              >
                {shape.label}
              </motion.span>
            </span>
          ))}
        </div>
      </div>

      <div
        className="grid place-items-center"
        style={{ height: BOX + 24 }}
        aria-hidden
      >
        <motion.div
          className="grid place-items-center overflow-hidden rounded-lg"
          style={{
            width: frameSize(SHAPES[0].ratio).width,
            height: frameSize(SHAPES[0].ratio).height,
            background:
              "linear-gradient(150deg, #3d100b 0%, #7c1d12 55%, #23100c 100%)",
          }}
          animate={
            reduce ? undefined : { width: frameW, height: frameH }
          }
          transition={{ ...loop, times: STOPS }}
        >
          {/* The recording itself — never cropped, never squashed. */}
          <motion.div
            className="overflow-hidden rounded-[3px] bg-[#f7f6f3] shadow-[0_6px_18px_-6px_rgba(0,0,0,0.8)]"
            style={{
              width: pictureSize(SHAPES[0].ratio).width,
              height: pictureSize(SHAPES[0].ratio).height,
            }}
            animate={
              reduce ? undefined : { width: picW, height: picH }
            }
            transition={{ ...loop, times: STOPS }}
          >
            <div className="relative h-full w-full">
              <div className="absolute inset-y-0 left-0 w-[18%] bg-[#15130f]" />
              <div className="absolute top-[9%] left-[24%] h-[9%] w-[38%] rounded-[1px] bg-[#dedbd3]" />
              <div className="absolute top-[28%] left-[24%] h-[30%] w-[26%] rounded-[1px] bg-[#e9e6df]" />
              <div className="absolute top-[28%] left-[56%] h-[30%] w-[26%] rounded-[1px] bg-[#e9e6df]" />
              <div className="absolute top-[68%] left-[24%] h-[12%] w-[20%] rounded-[1px] bg-red" />
            </div>
          </motion.div>
        </motion.div>
      </div>

      <p className="mt-2 text-center font-mono text-[11px] text-muted-foreground">
        the picture keeps its proportions; the background takes the rest
      </p>
    </div>
  );
}
