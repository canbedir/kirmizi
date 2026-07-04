"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/cn";

const SIZES = {
  sm: "h-9 gap-1.5 pl-3.5 pr-4 text-sm",
  lg: "h-12 gap-2 pl-5 pr-6 text-base",
} as const;

const DOT = { sm: "size-1.5", lg: "size-2" } as const;
const ARROW = { sm: "size-3.5", lg: "size-4" } as const;

/**
 * The premium record CTA — a red pill with a soft glow, a hover sheen sweep, a
 * nudging arrow, and a subtle press. The dot stays steady (pulsing is reserved
 * for the live recording state).
 */
export function RecordButton({
  children,
  href = "/record",
  size = "lg",
  className,
}: {
  children: React.ReactNode;
  href?: string;
  size?: "sm" | "lg";
  className?: string;
}) {
  const reduce = useReducedMotion();

  return (
    <motion.span
      className={cn("inline-block", className)}
      whileHover={reduce ? undefined : { scale: 1.03 }}
      whileTap={reduce ? undefined : { scale: 0.97 }}
    >
      <Link
        href={href}
        className={cn(
          "group relative inline-flex items-center overflow-hidden rounded-full bg-red font-medium text-red-foreground shadow-[0_10px_30px_-8px_var(--glow)] outline-none transition-[background-color,box-shadow] hover:bg-red-hover hover:shadow-[0_16px_44px_-8px_var(--glow)] focus-visible:ring-2 focus-visible:ring-red/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          SIZES[size],
        )}
      >
        <span
          aria-hidden
          className={cn(
            "rounded-full bg-red-foreground shadow-[0_0_8px_var(--red-foreground)]",
            DOT[size],
          )}
        />
        <span className="relative">{children}</span>
        <ArrowRight
          className={cn(
            "transition-transform duration-300 group-hover:translate-x-0.5",
            ARROW[size],
          )}
        />
        {/* Sheen sweep on hover */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 -translate-x-[130%] skew-x-12 bg-linear-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-[130%]"
        />
      </Link>
    </motion.span>
  );
}
