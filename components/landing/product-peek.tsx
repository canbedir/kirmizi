"use client";

import { useRef } from "react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from "motion/react";
import { ProductDemo } from "@/components/landing/product-demo";

/**
 * The card the demo plays inside: a browser-shaped frame that rises from below
 * with a soft shadow and a faint red glow, and drifts against the scroll.
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
        {/* One session, played out — chrome and all, so the address bar can
            change when the clip becomes a link. */}
        <ProductDemo />
      </motion.div>
    </section>
  );
}
