"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Camera, Mic, SlidersHorizontal, Volume2 } from "lucide-react";
import { formatDuration } from "@/lib/format";

type PhaseKey = "landing" | "idle" | "countdown" | "recording";

const PHASES: { key: PhaseKey; duration: number }[] = [
  { key: "landing", duration: 3000 },
  { key: "idle", duration: 3000 },
  { key: "countdown", duration: 3000 },
  { key: "recording", duration: 3200 },
];

// Where the fake cursor rests during each phase (percent of the frame).
const CURSOR: Record<PhaseKey, { x: number; y: number }> = {
  landing: { x: 50, y: 63 },
  idle: { x: 50, y: 30 },
  countdown: { x: 82, y: 84 },
  recording: { x: 82, y: 84 },
};

const sceneTransition = {
  initial: { opacity: 0, x: 24 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -24 },
  transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const },
};

/**
 * A looping, code-driven walkthrough that plays inside the product-peek frame:
 * land → click "Start recording" → the record screen → click record → 3·2·1 →
 * recording. No video, no screenshots — a live recreation of the flow.
 */
export function ProductDemo() {
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [ripple, setRipple] = useState(0);
  const [count, setCount] = useState(3);
  const [seconds, setSeconds] = useState(12);

  const phase = PHASES[index].key;

  // Drive the phase loop.
  useEffect(() => {
    if (reduce) return;
    let advance: ReturnType<typeof setTimeout>;
    let click: ReturnType<typeof setTimeout>;
    let i = index;

    const run = () => {
      const { key, duration } = PHASES[i];
      setIndex(i);
      if (key === "countdown") setCount(3);
      if (key === "recording") setSeconds(12);
      if (key === "landing" || key === "idle") {
        click = setTimeout(() => setRipple((r) => r + 1), 1500);
      }
      advance = setTimeout(() => {
        i = (i + 1) % PHASES.length;
        run();
      }, duration);
    };
    run();

    return () => {
      clearTimeout(advance);
      clearTimeout(click);
    };
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
        <IdleScene />
      </div>
    );
  }

  const target = CURSOR[phase];

  return (
    <div
      aria-hidden
      className="@container relative aspect-[16/10] w-full overflow-hidden bg-background"
    >
      <AnimatePresence>
        <motion.div key={phase} className="absolute inset-0" {...sceneTransition}>
          {phase === "landing" && <LandingScene />}
          {phase === "idle" && <IdleScene />}
          {phase === "countdown" && <CountdownScene value={count} />}
          {phase === "recording" && <RecordingScene seconds={seconds} />}
        </motion.div>
      </AnimatePresence>

      {/* Fake cursor */}
      <motion.div
        className="pointer-events-none absolute z-10 will-change-transform"
        animate={{ left: `${target.x}%`, top: `${target.y}%` }}
        transition={{ duration: 1.15, ease: [0.22, 1, 0.36, 1] }}
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

function LandingScene() {
  return (
    <div className="absolute inset-0">
      <div className="absolute left-[6%] top-[9%] flex items-center gap-[1cqw]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/kirmizi-logo.png" alt="" className="h-[3.4cqw] w-auto" />
        <span className="font-bold text-[3cqw] leading-none">Kırmızı</span>
      </div>
      <p className="absolute inset-x-0 top-[26%] text-center font-serif text-[7cqw] leading-[1.05]">
        Record your screen.
        <br />
        Nothing <span className="italic text-red">leaves</span>.
      </p>
      <div className="absolute inset-x-0 top-[58%] flex justify-center">
        <span className="rounded-full bg-red px-[3.2cqw] py-[1.5cqw] text-[2.6cqw] font-bold text-red-foreground shadow-[0_0_5cqw_var(--glow)]">
          Start recording
        </span>
      </div>
    </div>
  );
}

function IdleScene() {
  return (
    <div className="absolute inset-0">
      <div className="absolute left-1/2 top-[15%] grid -translate-x-1/2 place-items-center rounded-full border-[0.4cqw] border-red/40 size-[16cqw]">
        <span className="rounded-full bg-red size-[7cqw] shadow-[0_0_4cqw_var(--glow)]" />
      </div>
      <p className="absolute inset-x-0 top-[46%] text-center font-bold text-[3.6cqw]">
        Start recording
      </p>
      <div className="absolute inset-x-0 top-[60%] flex justify-center gap-[1.4cqw]">
        <Pill icon={<Mic className="size-[1.8cqw]" />} label="Mic" active />
        <Pill icon={<Volume2 className="size-[1.8cqw]" />} label="System" />
        <Pill
          icon={<Camera className="size-[1.8cqw]" />}
          label="Camera"
          active
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
      className={
        "inline-flex items-center gap-[0.8cqw] rounded-full border px-[1.8cqw] py-[0.9cqw] text-[1.9cqw] " +
        (active
          ? "border-red/30 bg-red/10 text-foreground"
          : "border-border text-muted-foreground")
      }
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

function RecordingScene({ seconds }: { seconds: number }) {
  return (
    <div className="absolute inset-0 flex flex-col justify-center gap-[3cqw] p-[5cqw]">
      {/* Live preview of the screen being recorded */}
      <div className="relative w-full grow overflow-hidden rounded-[1.5cqw] border border-border bg-linear-to-br from-surface to-background">
        <div className="absolute inset-0 flex gap-[2.4cqw] p-[3.4cqw]">
          <div className="w-[22%] rounded-[1cqw] bg-muted-foreground/10" />
          <div className="flex flex-1 flex-col justify-center gap-[1.8cqw]">
            <span className="h-[1.3cqw] w-2/3 rounded-full bg-muted-foreground/20" />
            <span className="h-[1.3cqw] w-1/2 rounded-full bg-muted-foreground/20" />
            <span className="h-[1.3cqw] w-3/4 rounded-full bg-muted-foreground/15" />
            <span className="h-[1.3cqw] w-1/3 rounded-full bg-red/40" />
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
        <span className="rounded-full bg-red px-[3.2cqw] py-[1.4cqw] text-[2.2cqw] font-bold text-red-foreground">
          Stop recording
        </span>
      </div>
    </div>
  );
}
