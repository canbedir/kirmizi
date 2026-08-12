"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";

// The player on a shared link's page.
//
// Native controls, because someone who followed a link wants to press play,
// not to learn a new set of buttons. The only thing added is how long the clip
// has left, counted down live — a link that disappears tomorrow ought to say so
// while you can still do something about it.

function remaining(expiresAt: number): string | null {
  const ms = expiresAt - Date.now();
  if (ms <= 0) return null;
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  if (hours >= 1) return `${hours}h ${minutes}m left`;
  if (minutes >= 1) return `${minutes}m left`;
  return "less than a minute left";
}

export function SharePlayer({
  src,
  width,
  height,
  expiresAt,
}: {
  src: string;
  width: number;
  height: number;
  expiresAt: number;
}) {
  const [left, setLeft] = useState<string | null>(() => remaining(expiresAt));

  useEffect(() => {
    const tick = () => setLeft(remaining(expiresAt));
    tick();
    const timer = setInterval(tick, 30_000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  return (
    <div className="flex w-full max-w-4xl flex-col gap-3">
      <video
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
        <span>{left ?? "expiring now"}</span>
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
