"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Camera,
  Check,
  Download,
  Mic,
  Scissors,
  SlidersHorizontal,
  Volume2,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/format";

type PhaseKey =
  | "landing"
  | "idle"
  | "countdown"
  | "recording"
  | "editor"
  | "saved";

/** A timed event inside a phase: move the cursor, press a target, or both. */
interface Cue {
  at: number;
  x?: number;
  y?: number;
  press?: string;
  action?: "micOn" | "editSplit" | "editGap";
}

const PHASES: { key: PhaseKey; duration: number; cues: Cue[] }[] = [
  {
    key: "landing",
    duration: 3000,
    cues: [
      { at: 400, x: 50, y: 66 },
      { at: 1500, press: "cta" },
    ],
  },
  {
    key: "idle",
    duration: 3600,
    cues: [
      { at: 200, x: 33, y: 64 },
      { at: 1100, press: "mic", action: "micOn" },
      { at: 1900, x: 50, y: 28 },
      { at: 2800, press: "rec" },
    ],
  },
  {
    key: "countdown",
    duration: 3000,
    cues: [{ at: 300, x: 78, y: 82 }],
  },
  {
    key: "recording",
    duration: 4200,
    cues: [
      { at: 2700, x: 50, y: 88 },
      { at: 3600, press: "stop" },
    ],
  },
  {
    key: "editor",
    duration: 3800,
    cues: [
      { at: 1500, action: "editSplit" },
      { at: 2000, action: "editGap" },
      { at: 2300, x: 84, y: 67 },
      { at: 3200, press: "export" },
    ],
  },
  {
    key: "saved",
    duration: 2400,
    cues: [{ at: 300, x: 62, y: 74 }],
  },
];

const sceneTransition = {
  initial: { opacity: 0, scale: 0.985 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 1.01 },
  transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const },
};

// Slight overshoot so the cursor settles like a hand, not a tween.
const cursorEase = [0.3, 1.25, 0.45, 1] as const;

/** A mock control that dips when the fake cursor presses it. */
function Pressable({
  name,
  pressed,
  children,
  className,
}: {
  name: string;
  pressed: string | null;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.span
      className={cn("inline-flex", className)}
      animate={{ scale: pressed === name ? 0.92 : 1 }}
      transition={{ type: "spring", stiffness: 500, damping: 28 }}
    >
      {children}
    </motion.span>
  );
}

/**
 * A looping, code-driven walkthrough of the whole product inside the peek
 * frame: land → set up → 3·2·1 → record → cut in the editor → saved. The fake
 * cursor's targets actually react (buttons dip, the mic toggle flips, the cut
 * happens), so it reads as a real session rather than a slideshow.
 */
export function ProductDemo() {
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [cursor, setCursor] = useState({ x: 50, y: 86 });
  const [pressed, setPressed] = useState<string | null>(null);
  const [ripple, setRipple] = useState(0);
  const [micOn, setMicOn] = useState(false);
  const [count, setCount] = useState(3);
  const [seconds, setSeconds] = useState(12);
  const [editStep, setEditStep] = useState(0);

  const phase = PHASES[index].key;

  // Drive the phase loop and its cues.
  useEffect(() => {
    if (reduce) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let i = index;

    const run = () => {
      const { key, duration, cues } = PHASES[i];
      setIndex(i);
      if (key === "landing") setMicOn(false);
      if (key === "countdown") setCount(3);
      if (key === "recording") setSeconds(12);
      if (key === "editor") setEditStep(0);

      for (const cue of cues) {
        timers.push(
          setTimeout(() => {
            if (cue.x !== undefined && cue.y !== undefined) {
              setCursor({ x: cue.x, y: cue.y });
            }
            if (cue.press) {
              setPressed(cue.press);
              setRipple((r) => r + 1);
              timers.push(setTimeout(() => setPressed(null), 240));
            }
            if (cue.action === "micOn") setMicOn(true);
            if (cue.action === "editSplit") setEditStep(1);
            if (cue.action === "editGap") setEditStep(2);
          }, cue.at),
        );
      }

      timers.push(
        setTimeout(() => {
          i = (i + 1) % PHASES.length;
          run();
        }, duration),
      );
    };
    run();

    return () => timers.forEach(clearTimeout);
    // Run once on mount; the loop owns `i` internally.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce]);

  // Countdown ticks (initial value is set in the phase loop to avoid a flash).
  useEffect(() => {
    if (phase !== "countdown") return;
    const t2 = setTimeout(() => setCount(2), 1000);
    const t1 = setTimeout(() => setCount(1), 2000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [phase]);

  // Live timer while "recording".
  useEffect(() => {
    if (phase !== "recording") return;
    const id = setInterval(() => setSeconds((s) => s + 1), 800);
    return () => clearInterval(id);
  }, [phase]);

  if (reduce) {
    return (
      <div
        aria-hidden
        className="@container relative aspect-[16/10] w-full overflow-hidden bg-background"
      >
        <IdleScene micOn pressed={null} />
      </div>
    );
  }

  return (
    <div
      aria-hidden
      className="@container relative aspect-[16/10] w-full overflow-hidden bg-background"
    >
      <AnimatePresence>
        <motion.div key={phase} className="absolute inset-0" {...sceneTransition}>
          {phase === "landing" && <LandingScene pressed={pressed} />}
          {phase === "idle" && <IdleScene micOn={micOn} pressed={pressed} />}
          {phase === "countdown" && <CountdownScene value={count} />}
          {phase === "recording" && (
            <RecordingScene seconds={seconds} pressed={pressed} />
          )}
          {phase === "editor" && (
            <EditorScene step={editStep} pressed={pressed} />
          )}
          {phase === "saved" && <SavedScene />}
        </motion.div>
      </AnimatePresence>

      {/* Fake cursor */}
      <motion.div
        className="pointer-events-none absolute z-10 will-change-transform"
        animate={{ left: `${cursor.x}%`, top: `${cursor.y}%` }}
        transition={{ duration: 1.05, ease: cursorEase }}
      >
        <svg
          className="w-[3.4cqw] drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)]"
          viewBox="0 0 16 16"
          fill="none"
        >
          <path
            d="M1 1l4.8 13 2.1-5.3L13.2 6.6 1 1z"
            fill="white"
            stroke="black"
            strokeWidth="1"
            strokeLinejoin="round"
          />
        </svg>
        {/* Click ripple */}
        <motion.span
          key={ripple}
          className="absolute left-0 top-0 rounded-full border border-red"
          initial={{ width: 0, height: 0, x: 0, y: 0, opacity: 0.6 }}
          animate={{
            width: "7cqw",
            height: "7cqw",
            x: "-3.5cqw",
            y: "-3.5cqw",
            opacity: 0,
          }}
          transition={{ duration: 0.7, ease: "easeOut" }}
        />
      </motion.div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */

function LandingScene({ pressed }: { pressed: string | null }) {
  return (
    <div className="absolute inset-0">
      <div className="absolute left-[6%] top-[9%] flex items-center gap-[1cqw]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/kirmizi-logo.webp" alt="" className="h-[3.4cqw] w-auto" />
        <span className="font-bold text-[3cqw] leading-none">Kırmızı</span>
      </div>
      <p className="absolute inset-x-0 top-[26%] text-center font-serif text-[7cqw] leading-[1.05]">
        Record your screen.
        <br />
        Nothing <span className="italic text-red">leaves</span>.
      </p>
      <div className="absolute inset-x-0 top-[58%] flex justify-center">
        <Pressable name="cta" pressed={pressed}>
          <span className="rounded-full bg-red px-[3.2cqw] py-[1.5cqw] text-[2.6cqw] font-bold text-red-foreground shadow-[0_0_5cqw_var(--glow)]">
            Start recording
          </span>
        </Pressable>
      </div>
    </div>
  );
}

function IdleScene({
  micOn,
  pressed,
}: {
  micOn: boolean;
  pressed: string | null;
}) {
  return (
    <div className="absolute inset-0">
      <div className="absolute inset-x-0 top-[8%] flex justify-center">
        <Pressable name="rec" pressed={pressed}>
          <span className="grid place-items-center rounded-full border-[0.4cqw] border-red/40 size-[16cqw]">
            <span className="rounded-full bg-red size-[7cqw] shadow-[0_0_4cqw_var(--glow)]" />
          </span>
        </Pressable>
      </div>
      <p className="absolute inset-x-0 top-[46%] text-center font-bold text-[3.6cqw]">
        Start recording
      </p>
      <div className="absolute inset-x-0 top-[60%] flex justify-center gap-[1.4cqw]">
        <Pressable name="mic" pressed={pressed}>
          <Pill
            icon={<Mic className="size-[1.8cqw]" />}
            label="Mic"
            active={micOn}
          />
        </Pressable>
        <Pill icon={<Volume2 className="size-[1.8cqw]" />} label="System" />
        <Pill
          icon={<Camera className="size-[1.8cqw]" />}
          label="Camera"
          trailing={<SlidersHorizontal className="size-[1.6cqw] opacity-70" />}
        />
      </div>
      <div className="absolute inset-x-0 top-[78%] flex justify-center">
        <span className="inline-flex items-center gap-[0.8cqw] rounded-full border border-border px-[1.8cqw] py-[0.7cqw] text-[1.7cqw] text-muted-foreground">
          <SlidersHorizontal className="size-[1.5cqw]" />
          1080p · 60fps
        </span>
      </div>
    </div>
  );
}

function Pill({
  icon,
  label,
  active,
  trailing,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  trailing?: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[0.8cqw] rounded-full border px-[1.8cqw] py-[0.9cqw] text-[1.9cqw] transition-colors duration-300",
        active
          ? "border-red/30 bg-red/10 text-foreground"
          : "border-border text-muted-foreground",
      )}
    >
      {icon}
      {label}
      {trailing}
    </span>
  );
}

function CountdownScene({ value }: { value: number }) {
  return (
    <div className="absolute inset-0 grid place-items-center">
      <AnimatePresence mode="popLayout">
        <motion.span
          key={value}
          className="font-bold text-[24cqw] leading-none text-red"
          initial={{ opacity: 0, scale: 1.4 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.7 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

const LINES = [
  { w: 62, red: false },
  { w: 44, red: false },
  { w: 71, red: false },
  { w: 30, red: true },
];

function RecordingScene({
  seconds,
  pressed,
}: {
  seconds: number;
  pressed: string | null;
}) {
  return (
    <div className="absolute inset-0 flex flex-col justify-center gap-[3cqw] p-[5cqw]">
      {/* Live preview of the screen being recorded */}
      <div className="relative w-full grow overflow-hidden rounded-[1.5cqw] border border-border bg-linear-to-br from-surface to-background">
        <div className="absolute inset-0 flex gap-[2.4cqw] p-[3.4cqw]">
          <div className="w-[22%] rounded-[1cqw] bg-muted-foreground/10" />
          <div className="flex flex-1 flex-col justify-center gap-[1.8cqw]">
            {LINES.map((line, i) => (
              <motion.span
                key={i}
                className={cn(
                  "h-[1.3cqw] origin-left rounded-full",
                  line.red ? "bg-red/40" : "bg-muted-foreground/20",
                )}
                style={{ width: `${line.w}%` }}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{
                  duration: 0.7,
                  delay: 0.4 + i * 0.45,
                  ease: [0.22, 1, 0.36, 1],
                }}
              />
            ))}
          </div>
        </div>

        {/* Live timer badge */}
        <div className="absolute left-[4%] top-[8%] inline-flex items-center gap-[1cqw] rounded-full border border-border bg-background/70 px-[1.6cqw] py-[0.8cqw] backdrop-blur-md">
          <span className="record-dot record-dot--live size-[1.4cqw]" aria-hidden />
          <span className="font-mono text-[1.9cqw] tabular-nums">
            {formatDuration(seconds * 1000)}
          </span>
        </div>
      </div>

      <div className="flex justify-center">
        <Pressable name="stop" pressed={pressed}>
          <span className="rounded-full bg-red px-[3.2cqw] py-[1.4cqw] text-[2.2cqw] font-bold text-red-foreground">
            Stop recording
          </span>
        </Pressable>
      </div>
    </div>
  );
}

function EditorScene({
  step,
  pressed,
}: {
  step: number;
  pressed: string | null;
}) {
  const cut = step >= 2;
  return (
    <div className="absolute inset-0 flex flex-col justify-center gap-[2.6cqw] p-[5cqw]">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-[1cqw] text-[1.9cqw] font-bold uppercase tracking-[0.2em] text-muted-foreground">
          <Scissors className="size-[1.9cqw] text-red" />
          Trim
        </span>
        <span className="font-mono text-[1.9cqw] text-muted-foreground">
          00:08 <span className="opacity-50">/ 00:14</span>
        </span>
      </div>

      {/* Timeline: filmstrip, a split that becomes a removed gap, playhead */}
      <div className="relative h-[16cqw] overflow-hidden rounded-[1.2cqw] border border-border bg-surface">
        <div className="absolute inset-0 flex">
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className="h-full min-w-0 flex-1 border-r border-background/60 bg-linear-to-br from-surface to-background"
            />
          ))}
        </div>

        {/* Kept segments appear once the split lands */}
        <motion.div
          className="absolute inset-y-[6%] left-[2%] w-[40%] rounded-[0.8cqw] ring-[0.25cqw] ring-red/40"
          initial={false}
          animate={{ opacity: step >= 1 ? 1 : 0 }}
          transition={{ duration: 0.3 }}
        />
        <motion.div
          className="absolute inset-y-[6%] rounded-[0.8cqw] ring-[0.25cqw] ring-red/40"
          style={{ left: "56%", right: "2%" }}
          initial={false}
          animate={{ opacity: step >= 1 ? 1 : 0 }}
          transition={{ duration: 0.3 }}
        />

        {/* The removed middle */}
        <motion.div
          className="absolute inset-y-0 left-[42%] w-[14%]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(155,147,133,0.3) 5px, rgba(155,147,133,0.3) 6px)",
          }}
          initial={false}
          animate={{ opacity: cut ? 1 : 0 }}
          transition={{ duration: 0.35 }}
        />
        <motion.span
          className="absolute top-1/2 left-[49%] -translate-x-1/2 -translate-y-1/2 text-red"
          initial={false}
          animate={{ opacity: step >= 1 ? 1 : 0, scale: step >= 1 ? 1 : 0.5 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
        >
          <Scissors className="size-[2.4cqw]" />
        </motion.span>

        {/* Playhead sweeps once on entry */}
        <motion.span
          className="absolute inset-y-0 w-px bg-red"
          initial={{ left: "3%" }}
          animate={{ left: "42%" }}
          transition={{ duration: 1.3, ease: "linear" }}
        >
          <span className="absolute -top-[0.4cqw] -left-[0.8cqw] size-[1.8cqw] rounded-full border-[0.35cqw] border-background bg-red" />
        </motion.span>
      </div>

      <div className="flex items-center justify-between">
        <span className="font-mono text-[1.8cqw] text-muted-foreground">
          {cut ? "clip 00:11 · lossless" : "drag to cut"}
        </span>
        <Pressable name="export" pressed={pressed}>
          <span className="inline-flex items-center gap-[1cqw] rounded-full bg-red px-[2.6cqw] py-[1.2cqw] text-[2cqw] font-bold text-red-foreground">
            <Download className="size-[1.9cqw]" />
            Export clip
          </span>
        </Pressable>
      </div>
    </div>
  );
}

function SavedScene() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-[2.6cqw]">
      <motion.span
        className="grid place-items-center rounded-full bg-red/10 text-red ring-[0.3cqw] ring-red/30 size-[12cqw]"
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.15 }}
      >
        <Check className="size-[6cqw]" strokeWidth={3} />
      </motion.span>
      <p className="font-bold text-[3.4cqw]">Saved to your device</p>
      <span className="rounded-full border border-border px-[2cqw] py-[0.8cqw] font-mono text-[1.8cqw] text-muted-foreground">
        kirmizi-clip.mp4 · nothing uploaded
      </span>
    </div>
  );
}
