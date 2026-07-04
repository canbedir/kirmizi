"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Camera, Mic, Volume2 } from "lucide-react";
import { formatDuration } from "@/lib/format";

type PhaseKey = "landing" | "idle" | "countdown" | "recording";

const PHASES: { key: PhaseKey; duration: number }[] = [
  { key: "landing", duration: 3000 },
  { key: "idle", duration: 3000 },
  { key: "countdown", duration: 1800 },
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
    const t2 = setTimeout(() => setCount(2), 560);
    const t1 = setTimeout(() => setCount(1), 1120);
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
      <div className="@container relative aspect-[16/10] w-full overflow-hidden bg-background">
        <IdleScene />
      </div>
    );
  }

  const target = CURSOR[phase];

  return (
    <div className="@container relative aspect-[16/10] w-full overflow-hidden bg-background">
      <AnimatePresence mode="wait">
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
        <span className="record-dot size-[1.5cqw]" aria-hidden />
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
      <div className="absolute inset-x-0 top-[62%] flex justify-center gap-[1.4cqw]">
        <Pill icon={<Mic className="size-[1.8cqw]" />} label="Mic" active />
        <Pill icon={<Volume2 className="size-[1.8cqw]" />} label="System" />
        <Pill icon={<Camera className="size-[1.8cqw]" />} label="Camera" />
      </div>
    </div>
  );
}

function Pill({
  icon,
  label,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
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
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-[3cqw]">
      <span className="inline-flex items-center gap-[1.2cqw] text-[2cqw] font-bold uppercase tracking-[0.2em] text-muted-foreground">
        <span className="record-dot record-dot--live size-[1.5cqw]" aria-hidden />
        Recording
      </span>
      <span className="font-mono text-[11cqw] leading-none tabular-nums">
        {formatDuration(seconds * 1000)}
      </span>
      <span className="rounded-full bg-red px-[3.2cqw] py-[1.4cqw] text-[2.2cqw] font-bold text-red-foreground">
        Stop
      </span>
    </div>
  );
}
