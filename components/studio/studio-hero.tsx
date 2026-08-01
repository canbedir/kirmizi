"use client";

import Link from "next/link";
import { motion, useReducedMotion, type Variants } from "motion/react";
import { cn } from "@/lib/cn";
import { buttonVariants } from "@/components/ui/button";
import { RecordButton } from "@/components/record-button";

export function StudioHero() {
  const reduce = useReducedMotion();

  const container: Variants = {
    hidden: {},
    show: {
      transition: { staggerChildren: reduce ? 0 : 0.09, delayChildren: 0.04 },
    },
  };

  const item: Variants = reduce
    ? { hidden: { opacity: 0 }, show: { opacity: 1 } }
    : {
        hidden: { opacity: 0, y: 14 },
        show: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
        },
      };

  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-20 -z-10 h-120 w-160 max-w-[90vw] -translate-x-1/2 rounded-full opacity-70 blur-3xl"
        style={{
          background:
            "radial-gradient(50% 50% at 50% 50%, var(--glow), transparent 70%)",
        }}
      />

      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="mx-auto flex max-w-4xl flex-col items-center gap-7 px-6 pt-28 pb-16 text-center sm:pt-32"
      >
        <motion.h1
          variants={item}
          className="font-serif font-normal text-5xl leading-[1.04] tracking-tight text-balance sm:text-7xl"
        >
          It zooms where you
          <br />
          <span className="italic text-red">clicked</span>.
        </motion.h1>

        <motion.p
          variants={item}
          className="max-w-xl text-lg text-muted-foreground text-pretty"
        >
          The same recorder, paying attention. Every click becomes a zoom that
          eases in, holds, and lets go — placed for you, editable by you, and
          still built entirely on your own machine.
        </motion.p>

        <motion.div
          variants={item}
          className="flex flex-col items-center gap-3 sm:flex-row"
        >
          <RecordButton size="lg">Start recording</RecordButton>
          <Link
            href="#companion"
            className={cn(
              buttonVariants({ variant: "outline", size: "lg" }),
              "h-12 px-6 text-base",
            )}
          >
            What it needs
          </Link>
        </motion.div>
      </motion.div>
    </section>
  );
}
