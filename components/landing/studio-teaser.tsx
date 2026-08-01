"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Reveal } from "@/components/landing/reveal";

// A door to the studio page, for people whose recordings need more than a
// trim. The mock inside it isn't a still: it plays the actual behaviour —
// the pointer lands, the click is marked, the frame picks the target out and
// pushes in on it — so the claim is demonstrated rather than described.

const SCALE = 1.7;
const ARRIVE = 0.7; // the pointer lands, and the click with it
const IN_END = 1.25; // fully pushed in
const HOLD_END = 2.0; // held
const CYCLE = 2.7; // and back out, ready for the next

/** What auto zoom picks out, as fractions of the mock. Both are real
 *  elements below, and both centre inside what 1.7× can frame. */
const TARGETS = [
  { x: 0.2, y: 0.24, w: 0.33, h: 0.26 }, // the first card
  { x: 0.5124, y: 0.6493, w: 0.213, h: 0.0792 }, // the button in the panel
];
const TOTAL = TARGETS.length * CYCLE;

const centre = (t: (typeof TARGETS)[number]) => ({
  x: t.x + t.w / 2,
  y: t.y + t.h / 2,
});

const TRAVEL = [0.4, 0, 0.2, 1] as const; // a hand speeding up, then settling
const PUSH = [0.22, 1, 0.36, 1] as const; // the site's own ease, for the zoom

const shift = (f: number, s: number) =>
  s === 1 ? "0%" : `${(0.5 - f * s) * 100}%`;

/** The bracket auto zoom draws around what it chose. */
function ZoomFrame({
  target,
  index,
}: {
  target: (typeof TARGETS)[number];
  index: number;
}) {
  const base = index * CYCLE;
  const at = (s: number) => s / TOTAL;
  return (
    <motion.span
      aria-hidden
      className="absolute rounded-md border-2 border-red"
      style={{
        left: `${(target.x - 0.012) * 100}%`,
        top: `${(target.y - 0.018) * 100}%`,
        width: `${(target.w + 0.024) * 100}%`,
        height: `${(target.h + 0.036) * 100}%`,
      }}
      animate={{ opacity: [0, 0, 1, 1, 0, 0] }}
      transition={{
        duration: TOTAL,
        times: [
          0,
          at(base + ARRIVE) - 0.004,
          at(base + ARRIVE),
          at(base + HOLD_END),
          at(base + CYCLE),
          1,
        ],
        repeat: Infinity,
        ease: "easeOut",
      }}
    />
  );
}

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

/** The recording underneath: a plain app, built from blocks. */
function MockApp() {
  return (
    <div className="absolute inset-0 bg-[#f7f6f3]">
      {/* rail */}
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

      {/* top bar */}
      <div className="absolute inset-x-[15%] top-0 h-[15%] bg-white">
        <div className="absolute top-[36%] left-[6%] h-[28%] w-[26%] rounded-sm bg-[#e9e6df]" />
      </div>

      {/* two cards — the first is a target */}
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

      {/* panel — its button is the other target */}
      <div className="absolute top-[58%] right-[9%] bottom-[9%] left-[20%] rounded-md bg-white">
        <div className="absolute top-[14%] left-[7%] h-[12%] w-[30%] rounded-sm bg-[#eceae4]" />
        <div className="absolute top-[21%] left-[44%] h-[24%] w-[30%] rounded-md bg-red" />
        <div className="absolute top-[58%] left-[7%] h-[10%] w-[64%] rounded-sm bg-[#eceae4]" />
        <div className="absolute top-[76%] left-[7%] h-[10%] w-[44%] rounded-sm bg-[#eceae4]" />
      </div>
    </div>
  );
}

function EditorMock() {
  const reduce = useReducedMotion();

  const timeline = useMemo(() => {
    interface Key {
      t: number;
      scale: number;
      p: { x: number; y: number };
      press?: boolean;
    }
    const points = TARGETS.map(centre);
    // Start where the loop ends, so the wrap is invisible.
    const keys: Key[] = [
      { t: 0, scale: 1, p: points[points.length - 1] },
    ];
    points.forEach((point, i) => {
      const base = i * CYCLE;
      keys.push({ t: base + ARRIVE, scale: 1, p: point, press: true });
      keys.push({ t: base + IN_END, scale: SCALE, p: point });
      keys.push({ t: base + HOLD_END, scale: SCALE, p: point });
      keys.push({ t: base + CYCLE, scale: 1, p: point });
    });

    return {
      points,
      times: keys.map((k) => k.t / TOTAL),
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
    <div className="relative aspect-16/10 overflow-hidden rounded-xl border border-border bg-black shadow-[0_24px_60px_-24px_rgba(0,0,0,0.85)]">
      <motion.div
        className="absolute inset-0 origin-top-left"
        animate={reduce ? undefined : timeline.frame}
        transition={loop}
      >
        <MockApp />

        {!reduce && (
          <>
            {TARGETS.map((target, i) => (
              <ZoomFrame key={`f${i}`} target={target} index={i} />
            ))}
            {timeline.points.map((point, i) => (
              <ClickMark key={`c${i}`} at={point} beat={timeline.beats[i]} />
            ))}
            {/* The arrow's tip is its own origin, so left/top place it exactly. */}
            <motion.div
              className="absolute origin-top-left"
              style={{ width: "5%" }}
              animate={timeline.pointer}
              transition={loop}
              aria-hidden
            >
              <svg viewBox="0 0 12 18" className="h-auto w-full">
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

      {/* Sits over the recording, so it doesn't travel with the zoom. */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-2.5 left-2.5 inline-flex items-center gap-1.5 rounded-full bg-background/75 px-2 py-1 backdrop-blur-md"
      >
        <span className="record-dot record-dot--live size-1.5" />
        <span className="font-mono text-[9px] tracking-[0.15em] text-foreground">
          REC
        </span>
      </div>
    </div>
  );
}

export function StudioTeaser() {
  return (
    <section className="mx-auto max-w-6xl px-6 pb-8">
      <Reveal>
        <Link
          href="/studio"
          className="group relative block overflow-hidden rounded-2xl border border-border bg-surface/40 transition-colors hover:border-red/50"
        >
          {/* Glow rising from the lower left, brought up as the card is
              considered. */}
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-28 -left-20 h-80 w-[26rem] rounded-full opacity-35 blur-3xl transition-opacity duration-500 group-hover:opacity-75"
            style={{
              background:
                "radial-gradient(50% 50% at 50% 50%, var(--glow), transparent 70%)",
            }}
          />

          {/* Corner ribbon, clipped to the card's top-right radius. */}
          <div
            aria-hidden
            className="pointer-events-none absolute top-0 right-0 z-20 size-28 overflow-hidden rounded-tr-2xl"
          >
            <span className="absolute top-6 -right-9 w-40 rotate-45 bg-red py-1.5 text-center font-mono text-[10px] font-bold tracking-[0.25em] text-red-foreground shadow-[0_8px_20px_-6px_rgba(0,0,0,0.9)]">
              NEW
            </span>
          </div>

          <div className="relative grid items-center gap-8 p-6 sm:grid-cols-[1fr_27rem] sm:gap-10 sm:p-10">
            <div>
              <p className="mb-3 font-mono text-xs tracking-[0.2em] text-red uppercase">
                Studio
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

            {/* Runs off the card's right edge, and lifts when considered. */}
            <div className="w-[calc(100%+2.5rem)] transition-transform duration-500 group-hover:-translate-y-1 group-hover:-rotate-1 sm:w-[calc(100%+4.5rem)]">
              <EditorMock />
            </div>
          </div>
        </Link>
      </Reveal>
    </section>
  );
}
