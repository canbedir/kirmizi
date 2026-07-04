"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { navLinks, siteConfig } from "@/lib/site";
import { Wordmark } from "@/components/wordmark";
import { ThemeToggle } from "@/components/theme-toggle";
import { GithubIcon } from "@/components/icons";
import { RecordButton } from "@/components/record-button";

export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 w-full transition-colors duration-300",
        scrolled
          ? "border-b border-border bg-background/80 backdrop-blur-md"
          : "border-b border-transparent",
      )}
    >
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-6">
        <Wordmark />

        <div className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
          <a
            href={siteConfig.githubUrl}
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-foreground"
            aria-label="GitHub repository"
          >
            <GithubIcon className="size-[1.15rem]" />
          </a>
        </div>

        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <RecordButton size="sm" className="hidden sm:inline-block">
            Start recording
          </RecordButton>
        </div>
      </nav>
    </header>
  );
}
