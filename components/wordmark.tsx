import Link from "next/link";
import { cn } from "@/lib/cn";
import { siteConfig } from "@/lib/site";

/**
 * The Kırmızı wordmark: the name set in the display serif with a steady red
 * record dot. The dot only *pulses* while recording (see .record-dot--live);
 * here it stays solid so motion is reserved for the live HUD.
 */
export function Wordmark({
  className,
  href = "/",
}: {
  className?: string;
  href?: string | null;
}) {
  const content = (
    <span className={cn("inline-flex items-baseline gap-1.5", className)}>
      <span className="record-dot size-2 self-center" aria-hidden />
      <span className="font-serif text-2xl leading-none tracking-tight">
        {siteConfig.name}
      </span>
    </span>
  );

  if (href === null) return content;

  return (
    <Link
      href={href}
      className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      aria-label={`${siteConfig.name} — home`}
    >
      {content}
    </Link>
  );
}
