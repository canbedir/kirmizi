import type { Metadata } from "next";
import Link from "next/link";
import { siteConfig } from "@/lib/site";
import { SharePlayer } from "@/components/share/share-player";

// A shared clip, and nothing else on the page.
//
// Somebody followed a link to watch a video, so the video is the page: no nav,
// no sidebar, no suggestion of what else to look at. The one thing added is a
// quiet line saying where it came from and when it goes away, because a link
// that vanishes tomorrow should say so before it does.

interface Props {
  params: Promise<{ id: string }>;
}

/** Reads the clip's details from the share endpoint, or nothing. */
async function describe(id: string) {
  if (!siteConfig.shareApi || !/^[a-z0-9]{20}$/.test(id)) return null;
  const response = await fetch(`${siteConfig.shareApi}/i/${id}`, {
    // A link expires on a clock, so a cached page would outlive the clip.
    cache: "no-store",
  }).catch(() => null);
  if (!response?.ok) return null;
  return (await response.json().catch(() => null)) as {
    id: string;
    bytes: number;
    seconds: number;
    width: number;
    height: number;
    expiresAt: number;
    views?: number;
  } | null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const clip = await describe(id);
  const url = `${siteConfig.url}/v/${id}`;
  if (!clip) {
    return {
      title: `Link expired — ${siteConfig.name}`,
      description: "Shared clips are deleted a day after they're made.",
      robots: { index: false, follow: false },
      alternates: { canonical: url },
    };
  }
  const length = `${Math.floor(clip.seconds / 60)}:${String(Math.round(clip.seconds % 60)).padStart(2, "0")}`;
  const title = `A ${length} screen recording`;
  const description = `Recorded with ${siteConfig.name}. This link is deleted a day after it was made.`;
  const file = `${siteConfig.shareApi}/f/${id}`;
  return {
    title: `${title} — ${siteConfig.name}`,
    description,
    // Unlisted rather than secret, but there's no reason to help a crawler
    // find somebody's recording.
    robots: { index: false, follow: false },
    alternates: { canonical: url },
    openGraph: {
      type: "video.other",
      url,
      title,
      description,
      videos: [
        {
          url: file,
          secureUrl: file,
          type: "video/mp4",
          width: clip.width,
          height: clip.height,
        },
      ],
    },
    twitter: { card: "player", title, description },
  };
}

export default async function SharedClip({ params }: Props) {
  const { id } = await params;
  const clip = await describe(id);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-10">
      {clip ? (
        <SharePlayer
          id={id}
          src={`${siteConfig.shareApi}/f/${id}`}
          width={clip.width}
          height={clip.height}
          expiresAt={clip.expiresAt}
          views={clip.views ?? 0}
        />
      ) : (
        <div className="flex max-w-sm flex-col items-center gap-3 text-center">
          <h1 className="font-heading text-2xl">This link has expired</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Shared clips are deleted a day after they&apos;re made. Ask whoever
            sent it for a new one — or record your own, which never has to leave
            your machine at all.
          </p>
        </div>
      )}

      <Link
        href="/"
        className="font-mono text-[11px] text-muted-foreground/80 underline underline-offset-4 transition-colors hover:text-foreground"
      >
        recorded with {siteConfig.nameAscii.toLowerCase()} — record your own
      </Link>
    </main>
  );
}
