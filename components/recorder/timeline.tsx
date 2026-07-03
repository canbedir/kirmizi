"use client";

import { useEffect, useRef } from "react";
import { MicOff } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Segment } from "@/lib/use-video-editor";

interface TimelineProps {
  duration: number;
  segments: Segment[];
  selectedId: string | null;
  playhead: number;
  pxPerSec: number;
  thumbnails: string[];
  onSeek: (time: number) => void;
  onSelect: (id: string | null) => void;
}

interface Gap {
  start: number;
  end: number;
}

function gapsOf(segments: Segment[], duration: number): Gap[] {
  const sorted = [...segments].sort((a, b) => a.start - b.start);
  const gaps: Gap[] = [];
  let cursor = 0;
  for (const seg of sorted) {
    if (seg.start > cursor + 0.05) gaps.push({ start: cursor, end: seg.start });
    cursor = Math.max(cursor, seg.end);
  }
  if (cursor < duration - 0.05) gaps.push({ start: cursor, end: duration });
  return gaps;
}

export function Timeline({
  duration,
  segments,
  selectedId,
  playhead,
  pxPerSec,
  thumbnails,
  onSeek,
  onSelect,
}: TimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const width = Math.max(1, duration * pxPerSec);

  // Keep the playhead within view while it moves (e.g. during playback).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const x = playhead * pxPerSec;
    const margin = 48;
    if (x < el.scrollLeft + margin || x > el.scrollLeft + el.clientWidth - margin) {
      el.scrollLeft = x - el.clientWidth / 2;
    }
  }, [playhead, pxPerSec]);

  function timeFromEvent(clientX: number): number {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const x = clientX - rect.left;
    return Math.min(duration, Math.max(0, x / pxPerSec));
  }

  function handlePointerDown(event: React.PointerEvent) {
    draggingRef.current = true;
    trackRef.current?.setPointerCapture(event.pointerId);
    const time = timeFromEvent(event.clientX);
    onSeek(time);
    const hit = segments.find((s) => time >= s.start && time < s.end);
    onSelect(hit ? hit.id : null);
  }

  function handlePointerMove(event: React.PointerEvent) {
    if (!draggingRef.current) return;
    onSeek(timeFromEvent(event.clientX));
  }

  function handlePointerUp(event: React.PointerEvent) {
    draggingRef.current = false;
    trackRef.current?.releasePointerCapture(event.pointerId);
  }

  const gaps = gapsOf(segments, duration);

  return (
    <div
      ref={scrollRef}
      className="overflow-x-auto overflow-y-hidden rounded-lg border border-border bg-surface"
    >
      <div
        ref={trackRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="relative h-20 cursor-text touch-none select-none"
        style={{ width }}
      >
        {/* Filmstrip — min-w-0 lets each frame shrink below its intrinsic
            width so the strip scales with the track at every zoom level. */}
        <div className="pointer-events-none absolute inset-0 flex">
          {thumbnails.length > 0
            ? thumbnails.map((src, i) =>
                src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={i}
                    src={src}
                    alt=""
                    draggable={false}
                    className="h-full min-w-0 flex-1 object-cover opacity-70"
                  />
                ) : (
                  <div key={i} className="h-full min-w-0 flex-1 bg-background/40" />
                ),
              )
            : null}
        </div>

        {/* Deleted gaps */}
        {gaps.map((gap, i) => (
          <div
            key={`gap-${i}`}
            className="pointer-events-none absolute inset-y-0 bg-background/70"
            style={{
              left: gap.start * pxPerSec,
              width: (gap.end - gap.start) * pxPerSec,
              backgroundImage:
                "repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(155,147,133,0.25) 5px, rgba(155,147,133,0.25) 6px)",
            }}
          />
        ))}

        {/* Kept segments */}
        {segments.map((seg) => {
          const selected = seg.id === selectedId;
          return (
            <div
              key={seg.id}
              className={cn(
                "pointer-events-none absolute inset-y-0 rounded-md border transition-colors",
                selected
                  ? "border-red bg-red/10 ring-2 ring-red/40"
                  : "border-border/80 bg-transparent",
              )}
              style={{
                left: seg.start * pxPerSec,
                width: (seg.end - seg.start) * pxPerSec,
              }}
            >
              <div className="flex items-center gap-1 p-1">
                {seg.muted && (
                  <span className="rounded bg-background/80 p-0.5 text-red">
                    <MicOff className="size-3" />
                  </span>
                )}
                {seg.speed !== 1 && (
                  <span className="rounded bg-background/80 px-1 py-0.5 font-mono text-[10px] text-foreground">
                    {seg.speed}×
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {/* Playhead */}
        <div
          className="pointer-events-none absolute inset-y-0 z-10 w-px bg-red"
          style={{ left: Math.min(width - 1, playhead * pxPerSec) }}
        >
          <span className="absolute top-0 -left-1.25 size-2.75 rounded-full border-2 border-background bg-red" />
        </div>
      </div>
    </div>
  );
}
