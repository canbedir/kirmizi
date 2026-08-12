"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Eye } from "lucide-react";
import { markWatched, ownsShare } from "@/lib/share";

// The player on a shared link's page.
//
// Native controls, because someone who followed a link wants to press play,
// not to learn a new set of buttons. The only things added are how long the clip
// has left, counted down live — a link that disappears tomorrow ought to say so
// while you can still do something about it — and how many people have watched.

function remaining(expiresAt: number): string | null {
  const ms = expiresAt - Date.now();
  if (ms <= 0) return null;
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  if (hours >= 1) return `${hours}h ${minutes}m left`;
  if (minutes >= 1) return `${minutes}m left`;
  return "less than a minute left";
}

function watchers(views: number): string {
  if (views === 0) return "no views yet";
  return views === 1 ? "1 view" : `${views} views`;
}

export function SharePlayer({
  id,
  src,
  width,
  height,
  expiresAt,
  views,
}: {
  id: string;
  src: string;
  width: number;
  height: number;
  expiresAt: number;
  views: number;
}) {
  const [left, setLeft] = useState<string | null>(() => remaining(expiresAt));
  const [seen, setSeen] = useState(views);
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const tick = () => setLeft(remaining(expiresAt));
    tick();
    const timer = setInterval(tick, 30_000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  // Counted when the clip starts, not when the page opens: someone who was
  // sent a link and closed it didn't watch anything.
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    let counted = false;

    async function count() {
      if (counted) return;
      counted = true;
      // Whoever made the link shouldn't inflate its own number by checking it.
      if (ownsShare(id)) return;
      if (await markWatched(id)) setSeen((n) => n + 1);
    }

    element.addEventListener("play", count);
    // Autoplay may already have started before this ran.
    if (!element.paused) void count();
    return () => element.removeEventListener("play", count);
  }, [id]);

  return (
    <div className="flex w-full max-w-4xl flex-col gap-3">
      <video
        ref={video}
        src={src}
        controls
        autoPlay
        playsInline
        // Given so the page doesn't jump when the video's own size arrives.
        width={width || undefined}
        height={height || undefined}
        className="w-full rounded-xl border border-border bg-black shadow-[0_30px_90px_-40px_rgba(0,0,0,0.6)]"
      />
      <div className="flex items-center justify-between gap-3 font-mono text-[11px] text-muted-foreground">
        <span className="flex items-center gap-3">
          <span>{left ?? "expiring now"}</span>
          <span className="inline-flex items-center gap-1.5">
            <Eye className="size-3.5" />
            {watchers(seen)}
          </span>
        </span>
        <a
          href={src}
          download
          className="inline-flex items-center gap-1.5 underline underline-offset-4 transition-colors hover:text-foreground"
        >
          <Download className="size-3.5" />
          save a copy
        </a>
      </div>
    </div>
  );
}
