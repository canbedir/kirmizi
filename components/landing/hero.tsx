"use client";

import Link from "next/link";
import { motion, useReducedMotion, type Variants } from "motion/react";
import { cn } from "@/lib/cn";
import { socialLinks } from "@/lib/site";
import { buttonVariants } from "@/components/ui/button";
import { RecordButton } from "@/components/record-button";
import { GithubIcon, XIcon, BlueskyIcon } from "@/components/icons";

const socialIcons = {
  github: GithubIcon,
  x: XIcon,
  bluesky: BlueskyIcon,
} as const;

export function Hero() {
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
      {/* Soft brand glow rising behind the headline. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-24 -z-10 h-[32rem] w-[42rem] max-w-[90vw] -translate-x-1/2 rounded-full opacity-70 blur-3xl"
        style={{
          background:
            "radial-gradient(50% 50% at 50% 50%, var(--glow), transparent 70%)",
        }}
      />

      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="mx-auto flex max-w-4xl flex-col items-center gap-7 px-6 pb-28 pt-24 text-center sm:pt-32"
      >
        <motion.p
          variants={item}
          className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-3.5 py-1.5 text-xs text-muted-foreground backdrop-blur-sm"
        >
          <span className="record-dot size-1.5" aria-hidden />
          No signup · nothing ever uploaded
        </motion.p>

        <motion.h1
          variants={item}
          className="font-serif font-normal text-6xl leading-[1.02] tracking-tight text-balance sm:text-8xl"
        >
          Record your screen.
          <br />
          Nothing <span className="italic text-red">leaves</span>.
        </motion.h1>

        <motion.p
          variants={item}
          className="max-w-xl text-lg text-muted-foreground text-pretty"
        >
          A screen recorder that lives entirely in your browser. No account, no
          watermark — every frame stays on your machine.
        </motion.p>

        <motion.div
          variants={item}
          className="flex flex-col items-center gap-3 sm:flex-row"
        >
          <RecordButton size="lg">Start recording — it&apos;s free</RecordButton>
          <Link
            href="/#how-it-works"
            className={cn(
              buttonVariants({ variant: "outline", size: "lg" }),
              "h-12 px-6 text-base",
            )}
          >
            See how it works
          </Link>
        </motion.div>

        <motion.div
          variants={item}
          className="flex items-center gap-4 pt-2 text-muted-foreground"
        >
          {socialLinks.map((social) => {
            const Icon = socialIcons[social.icon];
            return (
              <a
                key={social.label}
                href={social.href}
                target="_blank"
                rel="noreferrer"
                aria-label={social.label}
                className="transition-colors hover:text-foreground"
              >
                <Icon className="size-[1.35rem]" />
              </a>
            );
          })}
          <span className="text-sm">Open source · runs 100% on-device</span>
        </motion.div>
      </motion.div>
    </section>
  );
}
