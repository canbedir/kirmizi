"use client";

import { useRef } from "react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from "motion/react";
import { Camera, Mic, Volume2 } from "lucide-react";

/**
 * The "product peek" — a rounded mock of the recorder's idle screen rising from
 * below with a soft shadow and a faint red glow (the Zen move, our own UI).
 * Placeholder art until /record exists; swap for a real screenshot in step 12.
 */
export function ProductPeek() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const y = useTransform(
    scrollYProgress,
    [0, 1],
    reduce ? ["0%", "0%"] : ["5%", "-5%"],
  );

  return (
    <section ref={ref} className="relative px-6 pb-28">
      {/* Faint accent glow pooling under the frame. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-10 -z-10 mx-auto h-72 max-w-3xl rounded-full opacity-60 blur-3xl"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 50%, var(--glow), transparent 70%)",
        }}
      />

      <motion.div
        style={{ y }}
        initial={{ opacity: 0, scale: reduce ? 1 : 0.97 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true, amount: 0.25 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="mx-auto max-w-4xl overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_40px_120px_-40px_rgba(0,0,0,0.55)]"
      >
        {/* Window chrome */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <span className="size-3 rounded-full bg-muted-foreground/25" />
          <span className="size-3 rounded-full bg-muted-foreground/25" />
          <span className="size-3 rounded-full bg-muted-foreground/25" />
          <div className="mx-auto rounded-md bg-background/60 px-3 py-1 font-mono text-xs text-muted-foreground">
            kirmizi.app/record
          </div>
        </div>

        {/* Recorder idle mock */}
        <div className="relative flex aspect-[16/10] flex-col items-center justify-center gap-7 bg-gradient-to-b from-background to-surface p-8">
          <div className="flex flex-col items-center gap-4">
            <button
              type="button"
              tabIndex={-1}
              aria-hidden
              className="group grid size-20 place-items-center rounded-full border-2 border-red/40 transition-colors"
            >
              <span className="size-9 rounded-full bg-red shadow-[0_0_24px_var(--glow)]" />
            </button>
            <p className="font-bold text-2xl">Start recording</p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            <MockToggle icon={<Mic className="size-4" />} label="Mic" active />
            <MockToggle icon={<Volume2 className="size-4" />} label="System audio" />
            <MockToggle icon={<Camera className="size-4" />} label="Camera" />
          </div>

          <p className="font-mono text-xs text-muted-foreground">
            Nothing leaves your browser.
          </p>
        </div>
      </motion.div>
    </section>
  );
}

function MockToggle({
  icon,
  label,
  active = false,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
}) {
  return (
    <span
      className={
        "inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm " +
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
