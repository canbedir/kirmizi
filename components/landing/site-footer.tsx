import Link from "next/link";
import { navLinks, siteConfig } from "@/lib/site";
import { Wordmark } from "@/components/wordmark";
import { GithubIcon } from "@/components/icons";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-8 px-6 py-12 text-center sm:flex-row sm:items-center sm:justify-between sm:text-left">
        <div className="flex flex-col items-center gap-3 sm:items-start">
          <Wordmark />
          <p className="max-w-xs text-sm text-muted-foreground">
            Record your screen. Nothing leaves your browser.
          </p>
        </div>

        <div className="flex flex-col items-center gap-4 text-sm text-muted-foreground sm:items-end">
          <div className="flex items-center gap-6">
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
              className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
            >
              <GithubIcon className="size-4" />
              GitHub
            </a>
          </div>
          <p>
            Built by{" "}
            <span className="text-foreground">{siteConfig.author}</span>. Everything
            runs on your machine.
          </p>
        </div>
      </div>
    </footer>
  );
}
