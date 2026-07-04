"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion, type Variants } from "motion/react";
import { AppWindow, Download, Monitor, PanelTop, Scissors } from "lucide-react";
import { formatDuration } from "@/lib/format";

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-40 items-center justify-center overflow-hidden rounded-xl border border-border bg-surface p-4">
      {children}
    </div>
  );
}

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } },
};

function PickVisual() {
  const reduce = useReducedMotion();
  const item: Variants = reduce
    ? { hidden: { opacity: 0 }, show: { opacity: 1 } }
    : {
        hidden: { opacity: 0, y: 10 },
        show: { opacity: 1, y: 0, transition: { duration: 0.45 } },
      };

  const tiles = [
    { icon: Monitor, label: "Screen", active: true },
    { icon: AppWindow, label: "Window", active: false },
    { icon: PanelTop, label: "Tab", active: false },
  ];

  return (
    <Panel>
      <motion.div
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.5 }}
        className="grid w-full grid-cols-3 gap-2.5"
      >
        {tiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <motion.div
              key={tile.label}
              variants={item}
              className={
                "flex flex-col items-center gap-2 rounded-lg border p-3 " +
                (tile.active
                  ? "border-red/40 bg-red/10 text-foreground ring-1 ring-red/30"
                  : "border-border text-muted-foreground")
              }
            >
              <Icon className="size-5" />
              <span className="text-[11px]">{tile.label}</span>
            </motion.div>
          );
        })}
      </motion.div>
    </Panel>
  );
}

function RecordVisual() {
  const reduce = useReducedMotion();
  const [seconds, setSeconds] = useState(8);

  useEffect(() => {
    if (reduce) return;
    const id = setInterval(() => setSeconds((s) => (s + 1) % 3600), 1000);
    return () => clearInterval(id);
  }, [reduce]);

  return (
    <Panel>
      <div className="flex flex-col items-center gap-3">
        <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
          <span className="record-dot record-dot--live size-2.5" aria-hidden />
          Recording
        </span>
        <span className="font-mono text-4xl tabular-nums">
          {formatDuration(seconds * 1000)}
        </span>
      </div>
    </Panel>
  );
}

function TrimVisual() {
  const reduce = useReducedMotion();
  return (
    <Panel>
      <div className="w-full space-y-3">
        <div className="relative h-9 overflow-hidden rounded-md border border-border bg-background">
          <div className="absolute inset-y-1 left-1 w-[36%] rounded bg-red/15 ring-1 ring-red/30" />
          <div
            className="absolute inset-y-1 rounded bg-red/15 ring-1 ring-red/30"
            style={{ left: "46%", right: "4px" }}
          />
          <div className="absolute inset-y-0 left-[36%] flex w-[10%] items-center justify-center text-red">
            <Scissors className="size-3.5" />
          </div>
          <motion.span
            className="absolute inset-y-0 w-px bg-red"
            initial={{ left: "3%" }}
            animate={reduce ? { left: "24%" } : { left: ["3%", "97%"] }}
            transition={
              reduce
                ? undefined
                : { duration: 3.5, repeat: Infinity, ease: "linear" }
            }
          >
            <span className="absolute -top-1 -left-1 size-2 rounded-full bg-red" />
          </motion.span>
        </div>
        <div className="flex justify-end">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red px-3 py-1.5 text-xs font-bold text-red-foreground">
            <Download className="size-3.5" />
            Download
          </span>
        </div>
      </div>
    </Panel>
  );
}

export function StepVisual({ n }: { n: number }) {
  if (n === 0) return <PickVisual />;
  if (n === 1) return <RecordVisual />;
  return <TrimVisual />;
}
