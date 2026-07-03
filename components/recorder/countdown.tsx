"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";

/** Full-bleed 3·2·1 overlay shown after the screen is picked. */
export function Countdown({ value }: { value: number }) {
  const reduce = useReducedMotion();
  if (value <= 0) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/85 backdrop-blur-sm">
      <AnimatePresence mode="popLayout">
        <motion.span
          key={value}
          initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.4 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.7 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="font-serif text-[14rem] leading-none text-red [text-shadow:0_0_60px_var(--glow)]"
        >
          {value}
        </motion.span>
      </AnimatePresence>
      <p className="absolute bottom-16 font-mono text-sm text-muted-foreground">
        Get ready — press Esc to cancel
      </p>
    </div>
  );
}
