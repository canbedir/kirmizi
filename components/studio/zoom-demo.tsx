"use client";

import { motion, useReducedMotion } from "motion/react";

// A loop of what the editor does on its own: the pointer lands somewhere, the
// click is marked, and the frame eases in on it before letting go again.
// Everything is markup — no video, no images, so it costs nothing to ship.

const LOOP = 9;
/** Beats of the loop, as fractions of its length. */
const T = [0, 0.13, 0.22, 0.38, 0.47, 0.6, 0.69, 0.84, 0.93, 1];
const SCALE = 1.9;

// Two things worth looking at, as fractions of the frame. These are the
// centres of real elements in the mock below — the primary button and the
// middle card — and both sit inside the range a 1.9× crop can reach without
// running off an edge.
const A = { x: 0.343, y: 0.682 };
const B = { x: 0.555, y: 0.29 };

/** Offset that brings a point to the middle of the frame once magnified. */
const offset = (f: number) => `${(0.5 - f * SCALE) * 100}%`;

const ease = [0.22, 1, 0.36, 1] as const;

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

function Ripple({ at, beat }: { at: { x: number; y: number }; beat: number }) {
  return (
    <motion.span
      aria-hidden
      className="absolute rounded-full border-2 border-white"
      style={{
        left: `${at.x * 100}%`,
        top: `${at.y * 100}%`,
        width: "5%",
        aspectRatio: "1",
        translate: "-50% -50%",
      }}
      initial={{ opacity: 0, scale: 0.3 }}
      animate={{ opacity: [0, 0.95, 0, 0], scale: [0.3, 0.4, 1.6, 1.6] }}
      transition={{
        duration: LOOP,
        times: [0, beat, beat + 0.07, 1],
        repeat: Infinity,
        ease: "easeOut",
      }}
    />
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

      {/* cards — the right-hand one is target B */}
      {[0.19, 0.44, 0.69].map((left, i) => (
        <div
          key={left}
          className="absolute top-[16%] h-[26%] rounded-md bg-white"
          style={{ left: `${left * 100}%`, width: "23%" }}
        >
          <div className="absolute top-[16%] left-[10%] h-[11%] w-[52%] rounded-sm bg-[#e9e6df]" />
          <div className="absolute top-[36%] left-[10%] h-[22%] w-[38%] rounded-sm bg-[#15130f]" />
          <div className="absolute bottom-[16%] left-[10%] h-[8%] w-[74%] rounded-sm bg-[#eceae4]" />
          {i === 2 && (
            <div className="absolute inset-0 rounded-md ring-2 ring-red/0" />
          )}
        </div>
      ))}

      {/* main panel — its button is target A, centred at (34.3%, 68.2%) */}
      <div className="absolute top-[48%] right-[8%] bottom-[8%] left-[19%] rounded-md bg-white">
        {[10, 24, 62, 76].map((top, i) => (
          <div
            key={top}
            className="absolute left-[5%] h-[7%] rounded-sm bg-[#eceae4]"
            style={{ top: `${top}%`, width: `${76 - (i % 3) * 18}%` }}
          />
        ))}
        <div className="absolute top-[38%] left-[8%] h-[16%] w-[26%] rounded-md bg-red" />
      </div>
    </div>
  );
}

export function ZoomDemo() {
  const reduce = useReducedMotion();

  const frame = {
    scale: [1, 1, SCALE, SCALE, 1, 1, SCALE, SCALE, 1, 1],
    x: [
      "0%",
      "0%",
      offset(A.x),
      offset(A.x),
      "0%",
      "0%",
      offset(B.x),
      offset(B.x),
      "0%",
      "0%",
    ],
    y: [
      "0%",
      "0%",
      offset(A.y),
      offset(A.y),
      "0%",
      "0%",
      offset(B.y),
      offset(B.y),
      "0%",
      "0%",
    ],
  };

  const at = (p: { x: number; y: number }) => ({
    left: `${p.x * 100}%`,
    top: `${p.y * 100}%`,
  });
  const start = { x: 0.22, y: 0.46 };
  const walk = [start, A, A, A, A, B, B, B, B, start];
  const pointer = {
    left: walk.map((p) => at(p).left),
    top: walk.map((p) => at(p).top),
  };

  const loop = {
    duration: LOOP,
    times: T,
    repeat: Infinity,
    ease,
  } as const;

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-black shadow-[0_30px_90px_-40px_rgba(0,0,0,0.7)]">
      <div className="relative aspect-video">
        <motion.div
          className="absolute inset-0 origin-top-left"
          animate={reduce ? undefined : frame}
          transition={loop}
        >
          <MockApp />

          {!reduce && (
            <>
              <Ripple at={A} beat={T[1]} />
              <Ripple at={B} beat={T[5]} />
              {/* The arrow's tip is its own origin, so left/top place it exactly. */}
              <motion.div
                className="absolute"
                style={{ width: "2.6%" }}
                animate={pointer}
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
