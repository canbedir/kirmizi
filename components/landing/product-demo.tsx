"use client";

import { useRef } from "react";
import {
  cubicBezier,
  easeOut,
  motion,
  useAnimationFrame,
  useInView,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from "motion/react";
import {
  Camera,
  Check,
  Copy,
  Download,
  FileVideo,
  Link2,
  Mic,
  Scissors,
  Share2,
  Trash2,
  Volume2,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/format";

// The demo at the top of the page: one session, played out.
//
// It is a single continuous take rather than a slideshow. The recording is
// captured once and then survives everything that happens to it — the timeline
// opens under it and takes a piece out, the frame closes in around it, a
// background paints in behind it, and at the end it is saved and handed over
// as a link. Nothing dissolves into a different picture, because the claim
// being made is that this is all one thing in one tab.
//
// Everything reads from a single clock, so nothing can drift out of step: the
// pointer, the countdown, the timer, the gradient and the progress bar are
// all functions of one number. The clock only advances while the demo is on
// screen, so scrolling past costs nothing and coming back resumes the take
// instead of restarting it.

const TOTAL = 41.8;

/** How long anything takes to arrive or leave. One fade, everywhere. */
const FADE = 0.5;

/** How long a control on the bar takes to swap for the next one. */
const SWAP = 0.28;

/**
 * When the next control may start arriving, given when this one leaves.
 *
 * Two fades, not one: a layer begins fading in *before* its beat, so a single
 * fade of clearance still has the two drawn over each other for most of the
 * swap. The extra beat is a moment of just the empty bar, which is what makes
 * it read as one control replacing another.
 */
const after = (leaves: number) => leaves + 2 * SWAP + 0.06;

/**
 * The storyboard, in seconds. Everything below is written against these.
 *
 * Where one thing replaces another — the controls on the dock, the panel above
 * them — the two beats are a fade apart rather than the same instant, so the
 * change is a hand-off and not a cut.
 */
const T = {
  hitMic: 1.9,
  hitCamera: 3.0,
  hitRecord: 4.2,
  countIn: 4.8,
  rolling: 7.5,
  clickInApp: 9.7,
  hitStop: 11.9,
  editorOpens: 12.3,
  editorReady: 13.6,
  hitSplit: 14.9,
  hitRemove: 16.6,
  editorCloses: 19.4,
  framing: 19.6,
  framed: 21.0,
  hitOcean: 22.7,
  hitEmber: 24.4,
  // Each row leaves at its own beat and the next arrives a shade later, so the
  // bar swaps rather than showing two things at once.
  frameRowOut: 26.4,
  exportRow: after(26.4),
  hitDownload: 27.7,
  saving: 28.2,
  saved: 30.6,
  exportRowOut: 32.6,
  shareRow: after(32.6),
  hitShare: 34.0,
  sheetUp: 34.5,
  linkDone: 36.2,
  hitCopy: 37.7,
  fadeOut: 40.4,
} as const;

/** A hand speeding up and settling, and the site's own curve for the rest. */
const TRAVEL = cubicBezier(0.4, 0, 0.2, 1);
const EASE = cubicBezier(0.22, 1, 0.36, 1);

/**
 * Where every control is, as a percentage of the stage.
 *
 * These are the demo's single source of truth for position: each control is
 * placed by its spot and the pointer is sent to the same number, so the tip
 * lands in the middle of the thing it presses by construction. Laying the
 * controls out with flexbox and guessing at the coordinates cannot be made to
 * agree, and looks exactly like what it is.
 */
const SPOT = {
  record: { x: 50, y: 25 },
  mic: { x: 29, y: 60 },
  system: { x: 50, y: 60 },
  camera: { x: 71, y: 60 },
  inApp: { x: 66, y: 60 },
  stop: { x: 50, y: 90 },
  strip: { x: 50, y: 76 },
  split: { x: 37, y: 93 },
  remove: { x: 55, y: 93 },
  dock: { x: 50, y: 87 },
  dusk: { x: 44, y: 87 },
  ocean: { x: 50, y: 87 },
  ember: { x: 56, y: 87 },
  download: { x: 50, y: 87 },
  share: { x: 50, y: 87 },
  // Both answers come up in the same place, so the panel reads as one thing
  // being told twice rather than two panels.
  sheet: { x: 50, y: 62 },
  bar: { x: 50, y: 62 },
  // The row is a 31cqw link chip, a gap, and a 3.6cqw button, centred on the
  // card — so these are where those two actually end up, not where they look
  // like they might.
  link: { x: 47.4, y: 62 },
  copy: { x: 66.3, y: 62 },
} as const;

type Spot = { x: number; y: number };

/** Where the pointer is, and where it presses. */
const PATH: { at: number; to: Spot; press?: boolean }[] = [
  { at: 0, to: { x: 86, y: 110 } },
  { at: 0.9, to: { x: 86, y: 110 } },
  { at: T.hitMic, to: SPOT.mic, press: true },
  { at: 2.1, to: SPOT.mic },
  { at: T.hitCamera, to: SPOT.camera, press: true },
  { at: 3.2, to: SPOT.camera },
  { at: T.hitRecord, to: SPOT.record, press: true },
  { at: 8.7, to: SPOT.record },
  { at: T.clickInApp, to: SPOT.inApp, press: true },
  { at: 10.9, to: SPOT.inApp },
  { at: T.hitStop, to: SPOT.stop, press: true },
  { at: 13.9, to: SPOT.stop },
  { at: T.hitSplit, to: SPOT.split, press: true },
  { at: 15.6, to: SPOT.split },
  { at: T.hitRemove, to: SPOT.remove, press: true },
  { at: 21.7, to: SPOT.remove },
  { at: T.hitOcean, to: SPOT.ocean, press: true },
  { at: 23.5, to: SPOT.ocean },
  { at: T.hitEmber, to: SPOT.ember, press: true },
  { at: 26.6, to: SPOT.ember },
  { at: T.hitDownload, to: SPOT.download, press: true },
  { at: 32.8, to: SPOT.download },
  { at: T.hitShare, to: SPOT.share, press: true },
  { at: 36.2, to: SPOT.share },
  { at: T.hitCopy, to: SPOT.copy, press: true },
  { at: TOTAL, to: SPOT.copy },
];

/** The app's primary button, as fractions of the shot. */
const TARGET = { x: 0.575, y: 0.55, w: 0.17, h: 0.1 };

/** The backgrounds it tries, which are the editor's own presets. */
const DUSK = ["#41295a", "#392051", "#2f0743"];
const OCEAN = ["#0f2027", "#203a43", "#2c5364"];
const EMBER = ["#3d100b", "#7c241c", "#1a0c0a"];

const gradient = (c: string[]) =>
  `linear-gradient(135deg, ${c[0]} 0%, ${c[1]} 55%, ${c[2]} 100%)`;

/** The stretch of the take that gets cut, as fractions of the filmstrip. */
const CUT = { from: 0.42, to: 0.58 };

/* ---------------------------------------------------------------------- */
/* Bits that read the clock                                               */
/* ---------------------------------------------------------------------- */

/**
 * Present between two beats, arriving and leaving on the site's curve.
 *
 * A thing arrives over the fade *before* its beat and leaves over the fade
 * *after* it. Two things sharing a spot must therefore be scheduled to take
 * turns — the outgoing gone before the incoming starts — because fading them
 * through each other draws both at once, which reads as a mistake rather than
 * as a change. What holds the moment together is the bar underneath, which
 * never leaves; only what sits on it is replaced.
 */
function useLife(t: MotionValue<number>, from: number, to?: number, fade = FADE) {
  return useTransform(
    t,
    to === undefined ? [from - fade, from] : [from - fade, from, to, to + fade],
    to === undefined ? [0, 1] : [0, 1, 1, 0],
    { ease: EASE },
  );
}

/** Off before a beat, on after it. */
function useAfter(t: MotionValue<number>, at: number) {
  return useTransform(t, [at - 0.06, at], [0, 1]);
}

/** Anything placed by its spot, centred on it. */
function At({
  spot,
  className,
  style,
  children,
}: {
  spot: Spot;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn("absolute -translate-x-1/2 -translate-y-1/2", className)}
      style={{ left: `${spot.x}%`, top: `${spot.y}%`, ...style }}
    >
      {children}
    </div>
  );
}

function Layer({
  t,
  from,
  to,
  lift = 0,
  fade = FADE,
  className,
  style,
  children,
}: {
  t: MotionValue<number>;
  from: number;
  to?: number;
  /** How far it rises as it arrives, in stage widths. */
  lift?: number;
  /** Shorter for controls swapping on the bar, so they take turns cleanly. */
  fade?: number;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const opacity = useLife(t, from, to, fade);
  const rise = useTransform(t, [from - fade, from], [lift, 0], { ease: EASE });
  const y = useMotionTemplate`${rise}cqw`;
  return (
    <motion.div
      style={{ opacity, y: lift ? y : undefined, ...style }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/** A control that dips when the pointer lands on it. */
function Press({
  t,
  at,
  className,
  children,
}: {
  t: MotionValue<number>;
  at: number;
  className?: string;
  children: React.ReactNode;
}) {
  const scale = useTransform(t, [at - 0.14, at, at + 0.2], [1, 0.9, 1]);
  return (
    <motion.span style={{ scale }} className={cn("inline-flex", className)}>
      {children}
    </motion.span>
  );
}

/** The ring a click leaves — where it was clicked, not where the pointer went. */
function Ripple({ t, at, spot }: { t: MotionValue<number>; at: number; spot: Spot }) {
  const opacity = useTransform(t, [at - 0.01, at, at + 0.6], [0, 0.9, 0]);
  const scale = useTransform(t, [at, at + 0.6], [0.35, 1.7], { ease: easeOut });
  return (
    <motion.span
      className="absolute rounded-full border-[0.3cqw] border-white"
      style={{
        left: `${spot.x}%`,
        top: `${spot.y}%`,
        width: "7cqw",
        aspectRatio: "1",
        translate: "-50% -50%",
        opacity,
        scale,
      }}
    />
  );
}

/**
 * The lit copy of a control, faded in over the plain one.
 *
 * Colours here come from theme variables, and no amount of maths interpolates
 * `var(--border)` into a red — so "on" is a second element rather than a tween
 * between two strings.
 */
function Lit({
  on,
  children,
  className,
}: {
  on: MotionValue<number>;
  /** The lit copy. A ring or a wash needs none. */
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.span style={{ opacity: on }} className={className}>
      {children}
    </motion.span>
  );
}

/* ---------------------------------------------------------------------- */
/* The recording itself                                                   */
/* ---------------------------------------------------------------------- */

/** The app that happens to be on screen while the recording runs. */
function Shot() {
  return (
    <div className="absolute inset-0 bg-[#f7f6f3]">
      <div className="absolute inset-y-0 left-0 w-[14%] bg-[#15130f]">
        <div className="mt-[8%] ml-[15%] h-[4.5%] w-[52%] rounded-sm bg-red" />
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="mt-[9%] ml-[15%] h-[3.4%] rounded-sm bg-white/15"
            style={{ width: `${64 - i * 13}%` }}
          />
        ))}
      </div>

      <div className="absolute inset-x-[14%] top-0 h-[13%] border-b border-[#e6e2d9] bg-white">
        <div className="absolute top-[34%] left-[5%] h-[30%] w-[22%] rounded-sm bg-[#e9e6df]" />
        <div className="absolute top-[30%] right-[4%] h-[40%] w-[7%] rounded-full bg-[#e9e6df]" />
      </div>

      {/* a chart, whose bars have honest heights */}
      <div className="absolute top-[19%] left-[18%] h-[28%] w-[45%] rounded-md bg-white">
        <div className="absolute top-[13%] left-[6%] h-[11%] w-[36%] rounded-sm bg-[#e9e6df]" />
        <div className="absolute inset-x-[6%] bottom-[13%] flex h-[50%] items-end gap-[3%]">
          {[42, 66, 51, 78, 94, 63, 71].map((h, i) => (
            <span
              key={i}
              className={cn(
                "flex-1 rounded-t-[0.2cqw]",
                i === 4 ? "bg-red/70" : "bg-[#dcd7cc]",
              )}
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
      </div>

      {/* a list */}
      <div className="absolute top-[19%] right-[4%] h-[28%] w-[27%] rounded-md bg-white">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="absolute left-[8%] flex w-[84%] items-center gap-[7%]"
            style={{ top: `${16 + i * 20}%` }}
          >
            <span className="size-[2.2cqw] flex-none rounded-full bg-[#eceae4]" />
            <span
              className="h-[0.8cqw] rounded-sm bg-[#eceae4]"
              style={{ width: `${64 - i * 9}%` }}
            />
          </div>
        ))}
      </div>

      {/* the panel whose button gets clicked */}
      <div className="absolute top-[52%] right-[4%] bottom-[6%] left-[18%] rounded-md bg-white">
        <div className="absolute top-[12%] left-[4%] h-[13%] w-[26%] rounded-sm bg-[#eceae4]" />
        <div className="absolute top-[62%] left-[4%] h-[11%] w-[52%] rounded-sm bg-[#eceae4]" />
        <div className="absolute top-[81%] left-[4%] h-[11%] w-[34%] rounded-sm bg-[#eceae4]" />
      </div>

      {/* Placed against the shot, not the panel, so TARGET is exactly true. */}
      <div
        className="absolute rounded-[0.6cqw] bg-red"
        style={{
          left: `${TARGET.x * 100}%`,
          top: `${TARGET.y * 100}%`,
          width: `${TARGET.w * 100}%`,
          height: `${TARGET.h * 100}%`,
        }}
      />
    </div>
  );
}

/** One frame of the take, as it appears in the filmstrip. */
function Cell({ i }: { i: number }) {
  const lines = [0.72, 0.48, 0.63, 0.55, 0.8, 0.44, 0.68, 0.5, 0.6];
  return (
    <div className="relative h-full flex-1 overflow-hidden rounded-[0.3cqw] bg-[#f7f6f3]">
      <div className="absolute inset-y-0 left-0 w-[18%] bg-[#15130f]" />
      <div className="absolute top-[22%] left-[26%] h-[12%] w-[46%] rounded-[0.15cqw] bg-[#dcd7cc]" />
      <div
        className="absolute top-[46%] left-[26%] h-[12%] rounded-[0.15cqw] bg-[#dcd7cc]"
        style={{ width: `${lines[i % lines.length] * 60}%` }}
      />
      <div className="absolute top-[68%] left-[26%] h-[12%] w-[24%] rounded-[0.15cqw] bg-red/50" />
    </div>
  );
}

/* ---------------------------------------------------------------------- */

export function ProductDemo() {
  const reduce = useReducedMotion();
  const stage = useRef<HTMLDivElement>(null);
  const inView = useInView(stage, { margin: "300px" });

  // One clock for the whole take, and it only runs while anyone can see it.
  //
  // The elapsed time comes from the frame's own timestamp rather than an
  // accumulator, so if this callback ever runs twice in one frame — which
  // React's development double-mount will happily do — the second pass sees no
  // time at all instead of running the take at double speed.
  const t = useMotionValue(0);
  const clock = useRef({ seen: 0, at: 0 });
  useAnimationFrame((now) => {
    const c = clock.current;
    const delta = c.seen ? now - c.seen : 0;
    c.seen = now;
    if (!inView || reduce) return;
    // A tab returning from the background arrives with a huge delta; capping it
    // resumes the take rather than jumping most of the way through.
    c.at = (c.at + Math.min(delta, 50) / 1000) % TOTAL;
    t.set(c.at);
  });

  /* the pointer */
  const px = useTransform(t, PATH.map((p) => p.at), PATH.map((p) => `${p.to.x}%`), {
    ease: TRAVEL,
  });
  const py = useTransform(t, PATH.map((p) => p.at), PATH.map((p) => `${p.to.y}%`), {
    ease: TRAVEL,
  });
  const presses = PATH.filter((p) => p.press);
  const pressScale = useTransform(
    t,
    presses.flatMap((p) => [p.at - 0.12, p.at, p.at + 0.18]),
    presses.flatMap(() => [1, 0.82, 1]),
  );

  /* how the shot sits on the stage: full bleed, up on the timeline, framed */
  //
  // The corners are rounded the whole way through and the full-bleed state is
  // 2% oversized, which puts its corner arcs outside the stage — so it reads as
  // edge to edge without animating a border radius, and animating one repaints
  // the whole shot on every frame of the transition.
  const clipScale = useTransform(
    t,
    [T.editorOpens, T.editorReady, T.editorCloses, T.framed],
    [1.02, 0.64, 0.64, 0.88],
    { ease: EASE },
  );
  const lift = useTransform(
    t,
    [T.editorOpens, T.editorReady, T.editorCloses, T.framed],
    [0, -10, -10, 0],
    { ease: EASE },
  );
  const clipY = useMotionTemplate`${lift}cqw`;
  const clipIn = useLife(t, T.rolling - 0.2);

  /* the background it gets put on */
  //
  // Three fixed gradients stacked in the order they're chosen, cross-faded by
  // opacity — not one gradient whose colours are interpolated. Rewriting a
  // full-stage `linear-gradient(...)` every frame repaints the whole stage
  // sixty times a second, which is exactly what made the later acts stutter;
  // opacity is handed to the compositor and costs nothing.
  const duskIn = useTransform(t, [T.framing, T.framed], [0, 1], { ease: EASE });
  const oceanIn = useTransform(t, [T.hitOcean, T.hitOcean + 0.9], [0, 1], { ease: EASE });
  const emberIn = useTransform(t, [T.hitEmber, T.hitEmber + 0.9], [0, 1], { ease: EASE });

  /* what is switched on, and when */
  const micLit = useAfter(t, T.hitMic);
  const cameraLit = useAfter(t, T.hitCamera);
  const duskLit = useTransform(t, [T.hitOcean - 0.06, T.hitOcean], [1, 0]);
  const oceanLit = useTransform(
    t,
    [T.hitOcean - 0.06, T.hitOcean, T.hitEmber - 0.06, T.hitEmber],
    [0, 1, 1, 0],
  );
  const emberLit = useAfter(t, T.hitEmber);
  const copied = useAfter(t, T.hitCopy);
  const notCopied = useTransform(copied, [0, 1], [1, 0]);

  /* the cut */
  const splitIn = useAfter(t, T.hitSplit);
  const cutIn = useTransform(t, [T.hitRemove, T.hitRemove + 0.45], [0, 1], {
    ease: EASE,
  });
  // The playhead plays the kept part and steps over what was taken out, which
  // is what playback does once a cut exists.
  const head = useTransform(
    t,
    [T.editorReady, T.hitSplit, T.hitRemove, T.hitRemove + 0.5, T.editorCloses],
    [2, CUT.from * 100, CUT.from * 100, CUT.to * 100, 97],
    { ease: TRAVEL },
  );
  const headLeft = useMotionTemplate`${head}%`;

  /* the push-in */

  /* the export */
  const encoded = useTransform(t, [T.saving + 0.2, T.saved], [0, 1], { ease: EASE });
  const percent = useTransform(
    encoded,
    (v) => `${Math.round(v * 100)}% · 1920 × 1200 · mp4`,
  );

  /* text that has to change */
  const timer = useTransform(t, (v) =>
    formatDuration(Math.max(0, (v - T.rolling) * 2.4) * 1000),
  );
  const typed = useTransform(t, [T.sheetUp + 0.3, T.linkDone], [100, 0], { ease: EASE });
  const clipPath = useMotionTemplate`inset(0 ${typed}% 0 0)`;

  /* the wrap */
  const alive = useTransform(t, [0, 0.6, T.fadeOut, TOTAL], [0, 1, 1, 0], { ease: EASE });

  const live = !reduce;

  return (
    <div ref={stage} aria-hidden className="@container relative w-full">
      {/* Window chrome. The address is part of the story, so it changes too. */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <span className="size-3 rounded-full bg-muted-foreground/25" />
        <span className="size-3 rounded-full bg-muted-foreground/25" />
        <span className="size-3 rounded-full bg-muted-foreground/25" />
        <div className="relative mx-auto rounded-md bg-background/60 px-3 py-1 font-mono text-xs text-muted-foreground">
          {/* Both addresses are laid out, so the bar never changes width. */}
          <span className="invisible">kirmizi.app/v/xk2fq9dm4h</span>
          {live ? (
            <>
              <Layer
                t={t}
                from={0}
                to={T.sheetUp}
                fade={SWAP}
                className="absolute inset-0 grid place-items-center"
              >
                kirmizi.app/record
              </Layer>
              <Layer
                t={t}
                from={after(T.sheetUp)}
                fade={SWAP}
                className="absolute inset-0 grid place-items-center"
              >
                kirmizi.app/v/xk2fq9dm4h
              </Layer>
            </>
          ) : (
            <span className="absolute inset-0 grid place-items-center">
              kirmizi.app/v/xk2fq9dm4h
            </span>
          )}
        </div>
      </div>

      <motion.div
        className="relative aspect-16/10 w-full overflow-hidden bg-background"
        style={{ opacity: live ? alive : 1 }}
      >
        {/* What the clip is put on: each choice on top of the last. */}
        {live ? (
          [
            [DUSK, duskIn],
            [OCEAN, oceanIn],
            [EMBER, emberIn],
          ].map(([colors, opacity], i) => (
            <motion.div
              key={i}
              className="absolute inset-0"
              style={{
                backgroundImage: gradient(colors as string[]),
                opacity: opacity as MotionValue<number>,
              }}
            />
          ))
        ) : (
          <div className="absolute inset-0" style={{ backgroundImage: gradient(EMBER) }} />
        )}

        {/* Before the recording: the recorder, waiting. */}
        {live && (
          <Layer t={t} from={0} to={T.hitRecord + 0.3} className="absolute inset-0">
            <At spot={SPOT.record}>
              <Press t={t} at={T.hitRecord}>
                <span className="grid size-[15cqw] place-items-center rounded-full border-[0.4cqw] border-red/40">
                  <span className="size-[6.6cqw] rounded-full bg-red shadow-[0_0_4cqw_var(--glow)]" />
                </span>
              </Press>
            </At>
            <At spot={{ x: 50, y: 43 }}>
              <p className="text-center font-bold text-[3.4cqw] whitespace-nowrap">
                Start recording
              </p>
            </At>
            <At spot={SPOT.mic}>
              <Press t={t} at={T.hitMic}>
                <Pill lit={micLit} icon={<Mic className="size-[1.8cqw]" />} label="Mic" />
              </Press>
            </At>
            <At spot={SPOT.system}>
              <Pill icon={<Volume2 className="size-[1.8cqw]" />} label="System" />
            </At>
            <At spot={SPOT.camera}>
              <Press t={t} at={T.hitCamera}>
                <Pill
                  lit={cameraLit}
                  icon={<Camera className="size-[1.8cqw]" />}
                  label="Camera"
                />
              </Press>
            </At>
            <At spot={{ x: 50, y: 76 }}>
              <span className="rounded-full border border-border px-[1.8cqw] py-[0.7cqw] font-mono text-[1.7cqw] whitespace-nowrap text-muted-foreground">
                1080p · 60fps · no watermark
              </span>
            </At>
          </Layer>
        )}

        {/* 3 · 2 · 1 */}
        {live &&
          [3, 2, 1].map((n, i) => <Count key={n} t={t} n={n} at={T.countIn + i * 0.9} />)}

        {/* The recording, and everything that happens to it afterwards. */}
        <motion.div
          className="absolute inset-0 overflow-hidden rounded-[1.9cqw] shadow-[0_2.5cqw_5cqw_-1cqw_rgba(0,0,0,0.55)] will-change-transform"
          // The shadow is fixed rather than animated: at full bleed it falls
          // outside the stage and is clipped away, so it arrives by itself as
          // the frame closes in — and costs no repaints on the way.
          style={
            live
              ? { scale: clipScale, y: clipY, opacity: clipIn }
              : { scale: 0.88 }
          }
        >
          <div className="absolute inset-0">
            <Shot />
            {live && <Ripple t={t} at={T.clickInApp} spot={SPOT.inApp} />}
          </div>

          {/* Over the shot, so it neither zooms nor travels with it. */}
          <div className="absolute right-[2.5%] bottom-[3.5%] size-[12cqw] overflow-hidden rounded-full border-[0.35cqw] border-white/75 bg-[#2a2320] shadow-[0_1cqw_2cqw_rgba(0,0,0,0.4)]">
            <div className="absolute inset-0 bg-[radial-gradient(65%_55%_at_50%_35%,#6c5b52,transparent_72%)]" />
            <div className="absolute bottom-0 left-1/2 size-[8.5cqw] -translate-x-1/2 translate-y-[38%] rounded-full bg-[#4a3c35]" />
            <div className="absolute top-[24%] left-1/2 size-[4.2cqw] -translate-x-1/2 rounded-full bg-[#8b7568]" />
          </div>
        </motion.div>

        {/* The recorder's own HUD, which was never part of the picture. */}
        {live && (
          <>
            <Layer
              t={t}
              from={T.rolling}
              to={T.hitStop + 0.2}
              className="absolute top-[5%] left-[4%]"
            >
              <span className="inline-flex items-center gap-[1cqw] rounded-full border border-white/15 bg-black/60 px-[1.6cqw] py-[0.8cqw]">
                <span className="record-dot record-dot--live size-[1.3cqw]" />
                <motion.span className="font-mono text-[1.9cqw] tabular-nums text-white">
                  {timer}
                </motion.span>
              </span>
            </Layer>
            <Layer t={t} from={T.rolling} to={T.hitStop + 0.2} className="absolute inset-0">
              <At spot={SPOT.stop}>
                <Press t={t} at={T.hitStop}>
                  <span className="rounded-full bg-red px-[2.8cqw] py-[1.2cqw] text-[2cqw] font-bold whitespace-nowrap text-red-foreground shadow-[0_1cqw_3cqw_rgba(0,0,0,0.35)]">
                    Stop recording
                  </span>
                </Press>
              </At>
            </Layer>
          </>
        )}

        {/* The timeline, and the piece taken out of it. */}
        {live && (
          <Layer
            t={t}
            from={T.editorOpens}
            to={T.editorCloses}
            lift={5}
            className="absolute inset-0"
          >
            <At spot={SPOT.strip}>
              <div className="w-[86cqw] rounded-[1.2cqw] border border-border bg-surface p-[1.4cqw]">
                <div className="mb-[1.2cqw] flex items-center justify-between px-[0.4cqw]">
                  <span className="font-mono text-[1.5cqw] tracking-[0.18em] text-muted-foreground uppercase">
                    Timeline
                  </span>
                  <span className="relative font-mono text-[1.6cqw] tabular-nums text-muted-foreground">
                    <span className="invisible">00:24</span>
                    <Layer
                      t={t}
                      from={0}
                      to={T.hitRemove}
                      fade={SWAP}
                      className="absolute inset-0 text-right"
                    >
                      00:24
                    </Layer>
                    <Layer
                      t={t}
                      from={after(T.hitRemove)}
                      fade={SWAP}
                      className="absolute inset-0 text-right"
                    >
                      <span className="text-red">00:17</span>
                    </Layer>
                  </span>
                </div>

                <div className="relative h-[10cqw] overflow-hidden rounded-[0.8cqw] border border-border bg-background/50 p-[0.4cqw]">
                  <div className="flex h-full gap-[0.3cqw]">
                    {Array.from({ length: 12 }).map((_, i) => (
                      <Cell key={i} i={i} />
                    ))}
                  </div>

                  {/* What the split marked out, then what removing it did. */}
                  <motion.span
                    className="absolute inset-y-[0.4cqw] rounded-[0.5cqw] border-[0.25cqw] border-red"
                    style={{
                      left: `${CUT.from * 100}%`,
                      width: `${(CUT.to - CUT.from) * 100}%`,
                      opacity: splitIn,
                    }}
                  />
                  <motion.span
                    className="absolute inset-y-[0.4cqw] rounded-[0.5cqw] bg-background/75"
                    style={{
                      left: `${CUT.from * 100}%`,
                      width: `${(CUT.to - CUT.from) * 100}%`,
                      backgroundImage:
                        "repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(155,147,133,0.35) 4px, rgba(155,147,133,0.35) 5px)",
                      opacity: cutIn,
                    }}
                  />

                  <motion.span
                    className="absolute inset-y-0 z-10 w-px bg-red"
                    style={{ left: headLeft }}
                  >
                    <span className="absolute top-[-0.2cqw] left-[-0.7cqw] size-[1.6cqw] rounded-full border-[0.3cqw] border-background bg-red" />
                  </motion.span>
                </div>
              </div>
            </At>

            <At spot={SPOT.split}>
              <Press t={t} at={T.hitSplit}>
                <span className="inline-flex items-center gap-[0.8cqw] rounded-full border border-border bg-surface px-[2cqw] py-[0.8cqw] text-[1.8cqw] font-bold whitespace-nowrap">
                  <Scissors className="size-[1.7cqw] text-red" />
                  Split
                </span>
              </Press>
            </At>
            <At spot={SPOT.remove}>
              <Press t={t} at={T.hitRemove}>
                <span className="inline-flex items-center gap-[0.8cqw] rounded-full border border-border bg-surface px-[2cqw] py-[0.8cqw] text-[1.8cqw] font-bold whitespace-nowrap">
                  <Trash2 className="size-[1.7cqw] text-red" />
                  Remove
                </span>
              </Press>
            </At>
          </Layer>
        )}

        {/* The frame's controls, then the share button, on one bar. */}
        {live && (
          <>
            <Layer t={t} from={T.framed} lift={4} className="absolute inset-0">
              <At spot={SPOT.dock}>
                <div className="h-[7cqw] w-[34cqw] rounded-full border border-white/12 bg-black/65" />
              </At>
            </Layer>

            {/* Three sets of controls, each handing over to the next. */}
            <Layer
              t={t}
              from={T.framed}
              to={T.frameRowOut}
              fade={SWAP}
              className="absolute inset-0"
            >
              <At spot={SPOT.dusk}>
                <Swatch colors={DUSK} lit={duskLit} />
              </At>
              <At spot={SPOT.ocean}>
                <Press t={t} at={T.hitOcean}>
                  <Swatch colors={OCEAN} lit={oceanLit} />
                </Press>
              </At>
              <At spot={SPOT.ember}>
                <Press t={t} at={T.hitEmber}>
                  <Swatch colors={EMBER} lit={emberLit} />
                </Press>
              </At>
            </Layer>

            <Layer
              t={t}
              from={T.exportRow}
              to={T.exportRowOut}
              fade={SWAP}
              className="absolute inset-0"
            >
              <At spot={SPOT.download}>
                <Press t={t} at={T.hitDownload}>
                  <span className="inline-flex items-center gap-[0.9cqw] rounded-full bg-red px-[2.2cqw] py-[0.9cqw] text-[1.9cqw] font-bold whitespace-nowrap text-red-foreground">
                    <Download className="size-[1.7cqw]" />
                    Download
                  </span>
                </Press>
              </At>
            </Layer>

            <Layer t={t} from={T.shareRow} fade={SWAP} className="absolute inset-0">
              <At spot={SPOT.share}>
                <Press t={t} at={T.hitShare}>
                  <span className="inline-flex items-center gap-[0.9cqw] rounded-full border border-white/25 px-[2.2cqw] py-[0.9cqw] text-[1.9cqw] font-bold whitespace-nowrap text-white">
                    <Share2 className="size-[1.7cqw]" />
                    Or share a link
                  </span>
                </Press>
              </At>
            </Layer>
          </>
        )}

        {/* The download: the file being built, then the file. */}
        {live && (
          <Layer
            t={t}
            from={T.saving}
            to={T.exportRowOut}
            lift={5}
            className="absolute inset-0"
          >
            <At spot={SPOT.sheet}>
              <div className="h-[19cqw] w-[46cqw] rounded-[1.6cqw] border border-white/12 bg-[#15130f] shadow-[0_2cqw_4cqw_rgba(0,0,0,0.5)]" />
            </At>

            <At spot={{ x: SPOT.sheet.x, y: 53 }}>
              <span className="relative block">
                <span className="invisible font-mono text-[1.5cqw] tracking-[0.18em] whitespace-nowrap uppercase">
                  Saved to your device
                </span>
                <Layer
                  t={t}
                  from={T.saving}
                  to={T.saved}
                  fade={SWAP}
                  className="absolute inset-0 grid place-items-center"
                >
                  <span className="inline-flex items-center gap-[0.8cqw] font-mono text-[1.5cqw] tracking-[0.18em] whitespace-nowrap text-white/50 uppercase">
                    <FileVideo className="size-[1.4cqw]" />
                    Writing the file
                  </span>
                </Layer>
                <Layer
                  t={t}
                  from={after(T.saved)}
                  fade={SWAP}
                  className="absolute inset-0 grid place-items-center"
                >
                  <span className="inline-flex items-center gap-[0.8cqw] font-mono text-[1.5cqw] tracking-[0.18em] whitespace-nowrap text-white/50 uppercase">
                    <Check className="size-[1.5cqw] text-red" strokeWidth={3} />
                    Saved to your device
                  </span>
                </Layer>
              </span>
            </At>

            {/* Every frame drawn once, so the bar is honest about being work. */}
            <At spot={SPOT.bar}>
              <span className="block h-[1.4cqw] w-[34cqw] overflow-hidden rounded-full bg-white/12">
                <motion.span
                  className="block h-full w-full origin-left rounded-full bg-red"
                  style={{ scaleX: encoded }}
                />
              </span>
            </At>

            <At spot={{ x: SPOT.sheet.x, y: 71 }}>
              <span className="relative block">
                <span className="invisible font-mono text-[1.4cqw] whitespace-nowrap">
                  kirmizi-clip.mp4 · 4.8 MB · never uploaded
                </span>
                <Layer
                  t={t}
                  from={T.saving}
                  to={T.saved}
                  fade={SWAP}
                  className="absolute inset-0 grid place-items-center"
                >
                  <motion.span className="font-mono text-[1.4cqw] whitespace-nowrap text-white/45">
                    {percent}
                  </motion.span>
                </Layer>
                <Layer
                  t={t}
                  from={after(T.saved)}
                  fade={SWAP}
                  className="absolute inset-0 grid place-items-center"
                >
                  <span className="font-mono text-[1.4cqw] whitespace-nowrap text-white/45">
                    kirmizi-clip.mp4 · 4.8 MB · never uploaded
                  </span>
                </Layer>
              </span>
            </At>
          </Layer>
        )}

        {/* The link. Every part of it sits on its own spot, so the pointer can
            be sent to the button rather than near it. */}
        <Layer
          t={t}
          from={live ? T.sheetUp : 0}
          lift={live ? 5 : 0}
          className="absolute inset-0"
        >
          <At spot={SPOT.sheet}>
            <div className="h-[19cqw] w-[46cqw] rounded-[1.6cqw] border border-white/12 bg-[#15130f] shadow-[0_2cqw_4cqw_rgba(0,0,0,0.5)]" />
          </At>
          <At spot={{ x: SPOT.sheet.x, y: 53 }}>
            <span className="inline-flex items-center gap-[0.8cqw] font-mono text-[1.5cqw] tracking-[0.18em] whitespace-nowrap text-white/50 uppercase">
              <Link2 className="size-[1.4cqw]" />
              Link ready
            </span>
          </At>
          <At spot={SPOT.link}>
            <span className="relative block rounded-full bg-white/10 px-[1.8cqw] py-[0.8cqw] font-mono text-[1.9cqw] whitespace-nowrap text-white">
              <span className="invisible">kirmizi.app/v/xk2fq9dm4h</span>
              <motion.span
                className="absolute inset-0 grid place-items-center"
                style={live ? { clipPath } : undefined}
              >
                kirmizi.app/v/xk2fq9dm4h
              </motion.span>
            </span>
          </At>
          <At spot={SPOT.copy}>
            <Press t={t} at={T.hitCopy}>
              <span className="relative grid size-[3.6cqw] place-items-center rounded-full bg-white/15 text-white">
                <motion.span
                  className="absolute inset-0 grid place-items-center"
                  style={{ opacity: live ? notCopied : 0 }}
                >
                  <Copy className="size-[1.7cqw]" />
                </motion.span>
                <motion.span
                  className="absolute inset-0 grid place-items-center text-red"
                  style={{ opacity: live ? copied : 1 }}
                >
                  <Check className="size-[1.9cqw]" strokeWidth={3} />
                </motion.span>
              </span>
            </Press>
          </At>
          <At spot={{ x: SPOT.sheet.x, y: 71 }}>
            <span className="font-mono text-[1.4cqw] whitespace-nowrap text-white/45">
              gone in 24h · nothing else uploaded
            </span>
          </At>
        </Layer>

        {/* The pointer, in one unbroken path. Its tip is the origin, so it lands
            exactly on the spot it was sent to. */}
        {live && (
          <motion.div
            className="pointer-events-none absolute z-20 origin-top-left will-change-transform"
            style={{ left: px, top: py, scale: pressScale, width: "3.2cqw" }}
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
        )}
      </motion.div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */


function Pill({
  lit,
  icon,
  label,
}: {
  lit?: MotionValue<number>;
  icon: React.ReactNode;
  label: string;
}) {
  const body = (
    <>
      {icon}
      {label}
    </>
  );
  return (
    <span className="relative inline-flex items-center gap-[0.8cqw] rounded-full border border-border px-[1.8cqw] py-[0.9cqw] text-[1.9cqw] whitespace-nowrap text-muted-foreground">
      {body}
      {lit && (
        <Lit
          on={lit}
          className="absolute -inset-px inline-flex items-center gap-[0.8cqw] rounded-full border border-red/35 bg-red/10 px-[1.8cqw] py-[0.9cqw] text-foreground"
        >
          {body}
        </Lit>
      )}
    </span>
  );
}

function Swatch({ colors, lit }: { colors: string[]; lit: MotionValue<number> }) {
  return (
    <span className="relative block size-[3.4cqw]">
      <span
        className="absolute inset-0 rounded-[0.7cqw] border border-black/20"
        style={{ backgroundImage: gradient(colors) }}
      />
      <Lit
        on={lit}
        className="absolute inset-[-0.5cqw] block rounded-[1.1cqw] border-[0.3cqw] border-red"
      />
    </span>
  );
}

function Count({ t, n, at }: { t: MotionValue<number>; n: number; at: number }) {
  const opacity = useTransform(t, [at - 0.12, at, at + 0.62, at + 0.85], [0, 1, 1, 0]);
  const scale = useTransform(t, [at, at + 0.85], [1.3, 0.94], { ease: EASE });
  return (
    <motion.span
      className="absolute inset-0 grid place-items-center font-bold text-[22cqw] leading-none text-red"
      style={{ opacity, scale }}
    >
      {n}
    </motion.span>
  );
}

