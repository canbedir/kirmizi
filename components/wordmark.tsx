import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/cn";
import { siteConfig } from "@/lib/site";

/**
 * The Kırmızı wordmark: the phoenix logomark beside the name in the display sans.
 */
export function Wordmark({
  className,
  href = "/",
}: {
  className?: string;
  href?: string | null;
}) {
  const content = (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <Image
        src="/kirmizi-logo.png"
        alt=""
        width={510}
        height={570}
        priority
        className="h-6 w-auto"
      />
      <span className="font-bold text-2xl leading-none tracking-tight">
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
