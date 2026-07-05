"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Check, Download, Scissors } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/format";

const EASE = [0.22, 1, 0.36, 1] as const;

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div
      aria-hidden
      className="flex h-44 items-center justify-center overflow-hidden rounded-xl border border-border bg-linear-to-b from-surface to-background/60 p-4 transition-colors duration-300 hover:border-red/25"
    >
      {children}
    </div>
  );
}

/* -- 01 · Pick your screen ------------------------------------------------ */
/* Three picker tiles, each a tiny mock of what it captures; "Screen" gets
   selected a beat after they appear. */

function ScreenThumb() {
  return <div className="flex-1 rounded-sm bg-muted-foreground/15" />;
}

function WindowThumb() {
  return (
    <div className="relative flex-1">
      <div className="absolute inset-x-1.5 inset-y-1 rounded-sm bg-muted-foreground/15">
        <div className="flex gap-0.5 p-1">
          <span className="size-0.5 rounded-full bg-muted-foreground/40" />
          <span className="size-0.5 rounded-full bg-muted-foreground/40" />
        </div>
      </div>
    </div>
  );
}

function TabThumb() {
  return (
    <div className="flex flex-1 flex-col gap-0.5">
      <div className="flex h-1.5 items-end gap-0.5">
        <span className="h-full w-1/3 rounded-t-sm bg-muted-foreground/30" />
        <span className="h-1 w-1/3 rounded-t-sm bg-muted-foreground/10" />
      </div>
      <div className="flex-1 rounded-sm bg-muted-foreground/15" />
    </div>
  );
}

function PickVisual({ delay }: { delay: number }) {
  const reduce = useReducedMotion();
  const tiles = [
    { label: "Screen", thumb: <ScreenThumb />, active: true },
    { label: "Window", thumb: <WindowThumb />, active: false },
    { label: "Tab", thumb: <TabThumb />, active: false },
  ];

  return (
    <Panel>
      <div className="grid w-full grid-cols-3 gap-2.5">
        {tiles.map((tile, i) => (
          <motion.div
            key={tile.label}
            className="relative flex h-24 flex-col gap-1.5 rounded-lg border border-border bg-background/50 p-2"
            initial={reduce ? undefined : { opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: delay + i * 0.12, duration: 0.45, ease: EASE }}
          >
            {tile.thumb}
            <span className="text-center text-[11px] text-muted-foreground">
              {tile.label}
            </span>

            {tile.active && (
              <>
                <motion.span
                  className="absolute -inset-px rounded-lg bg-red/5 ring-2 ring-red/50"
                  initial={reduce ? undefined : { opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: delay + 0.8, duration: 0.3 }}
                />
                <motion.span
                  className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-red text-red-foreground"
                  initial={reduce ? undefined : { scale: 0 }}
                  whileInView={{ scale: 1 }}
                  viewport={{ once: true }}
                  transition={{
                    delay: delay + 0.9,
                    type: "spring",
                    stiffness: 400,
                    damping: 18,
                  }}
                >
                  <Check className="size-3" strokeWidth={3} />
                </motion.span>
              </>
            )}
          </motion.div>
        ))}
      </div>
    </Panel>
  );
}

/* -- 02 · Record ---------------------------------------------------------- */
/* A screen being captured: viewfinder corner brackets frame a mini screen
   whose content types in, with a small live-timer badge — not an audio look.
   The timer runs for a few seconds once in view, then holds. */

const CORNERS = [
  "top-0 left-0 rounded-tl-sm border-t-2 border-l-2",
  "top-0 right-0 rounded-tr-sm border-t-2 border-r-2",
  "bottom-0 left-0 rounded-bl-sm border-b-2 border-l-2",
  "bottom-0 right-0 rounded-br-sm border-b-2 border-r-2",
];

const SCREEN_LINES = [64, 42, 70, 30];

function RecordVisual({ delay }: { delay: number }) {
  const reduce = useReducedMotion();
  const [started, setStarted] = useState(false);
  const [seconds, setSeconds] = useState(8);

  useEffect(() => {
    if (!started || reduce) return;
    let s = 8;
    const id = setInterval(() => {
      s += 1;
      setSeconds(s);
      if (s >= 14) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [started, reduce]);

  return (
    <Panel>
      <motion.div
        className="relative flex h-full w-full flex-col gap-2.5 p-2"
        onViewportEnter={() => setStarted(true)}
        viewport={{ once: true }}
      >
        {/* Viewfinder corners */}
        {CORNERS.map((corner, i) => (
          <motion.span
            key={corner}
            className={cn("absolute size-3.5 border-red/70", corner)}
            initial={reduce ? undefined : { opacity: 0, scale: 1.6 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: delay + 0.2 + i * 0.08, duration: 0.35, ease: EASE }}
          />
        ))}

        {/* HUD row: live timer left, REC tag right */}
        <motion.div
          className="flex items-center justify-between px-1"
          initial={reduce ? undefined : { opacity: 0, y: -4 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: delay + 0.45, duration: 0.4, ease: EASE }}
        >
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/70 px-2 py-1">
            <span className="record-dot record-dot--live size-1.5" aria-hidden />
            <span className="font-mono text-[11px] tabular-nums">
              {formatDuration(seconds * 1000)}
            </span>
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-red/80">
            rec
          </span>
        </motion.div>

        {/* The screen being captured */}
        <div className="flex min-h-0 flex-1 gap-2.5 rounded-md border border-border bg-background/50 p-2.5">
          <div className="w-1/4 rounded-sm bg-muted-foreground/10" />
          <div className="flex flex-1 flex-col justify-center gap-2">
            {SCREEN_LINES.map((w, i) => (
              <motion.span
                key={i}
                className={cn(
                  "h-1 rounded-full",
                  i === SCREEN_LINES.length - 1
                    ? "bg-red/40"
                    : "bg-muted-foreground/20",
                )}
                style={{ width: `${w}%`, originX: 0 }}
                initial={reduce ? undefined : { scaleX: 0 }}
                whileInView={{ scaleX: 1 }}
                viewport={{ once: true }}
                transition={{
                  delay: delay + 0.6 + i * 0.3,
                  duration: 0.5,
                  ease: EASE,
                }}
              />
            ))}
          </div>
        </div>
      </motion.div>
    </Panel>
  );
}

/* -- 03 · Trim & download -------------------------------------------------- */
/* The playhead sweeps to the cut point, the scissors land, the middle drops
   out, and the download chip gives one confirming pulse. */

function TrimVisual({ delay }: { delay: number }) {
  const reduce = useReducedMotion();

  return (
    <Panel>
      <div className="w-full space-y-3">
        <div className="relative h-11 overflow-hidden rounded-md border border-border bg-background">
          {/* filmstrip backdrop */}
          <div className="absolute inset-0 flex">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-full min-w-0 flex-1 border-r border-surface bg-linear-to-br from-surface/80 to-background"
              />
            ))}
          </div>

          {/* kept segments light up once the cut lands */}
          <motion.div
            className="absolute inset-y-1 left-1 w-[38%] rounded bg-red/10 ring-1 ring-red/40"
            initial={reduce ? undefined : { opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: delay + 1.3, duration: 0.3 }}
          />
          <motion.div
            className="absolute inset-y-1 rounded bg-red/10 ring-1 ring-red/40"
            style={{ left: "56%", right: "4px" }}
            initial={reduce ? undefined : { opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: delay + 1.3, duration: 0.3 }}
          />

          {/* the removed middle */}
          <motion.div
            className="absolute inset-y-0 left-[40%] w-[15%]"
            style={{
              backgroundImage:
                "repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(155,147,133,0.3) 4px, rgba(155,147,133,0.3) 5px)",
            }}
            initial={reduce ? undefined : { opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: delay + 1.3, duration: 0.35 }}
          />
          <motion.span
            className="absolute top-1/2 left-[47.5%] -translate-x-1/2 -translate-y-1/2 text-red"
            initial={reduce ? undefined : { opacity: 0, scale: 0.4 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{
              delay: delay + 1.0,
              type: "spring",
              stiffness: 320,
              damping: 18,
            }}
          >
            <Scissors className="size-4" />
          </motion.span>

          {/* playhead sweeps once to the cut point */}
          <motion.span
            className="absolute inset-y-0 w-px bg-red"
            initial={reduce ? { left: "40%" } : { left: "3%" }}
            whileInView={{ left: "40%" }}
            viewport={{ once: true }}
            transition={{ delay: delay + 0.2, duration: 0.9, ease: "easeInOut" }}
          >
            <span className="absolute -top-1 -left-1 size-2 rounded-full bg-red" />
          </motion.span>
        </div>

        <div className="flex items-center justify-between">
          <motion.span
            className="font-mono text-xs text-muted-foreground"
            initial={reduce ? undefined : { opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: delay + 1.5, duration: 0.3 }}
          >
            clip 00:11 · lossless
          </motion.span>
          <motion.span
            className="inline-flex items-center gap-1.5 rounded-full bg-red px-3 py-1.5 text-xs font-bold text-red-foreground"
            initial={reduce ? undefined : { opacity: 0, y: 6 }}
            whileInView={
              reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: [1, 1.07, 1] }
            }
            viewport={{ once: true }}
            transition={{ delay: delay + 1.6, duration: 0.5, ease: EASE }}
          >
            <Download className="size-3.5" />
            Download
          </motion.span>
        </div>
      </div>
    </Panel>
  );
}

export function StepVisual({ n, delay }: { n: number; delay: number }) {
  if (n === 0) return <PickVisual delay={delay} />;
  if (n === 1) return <RecordVisual delay={delay} />;
  return <TrimVisual delay={delay} />;
}
