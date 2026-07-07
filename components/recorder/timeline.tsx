"use client";

import { useEffect, useRef, useState } from "react";
import { MicOff } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/format";
import type { Segment } from "@/lib/use-video-editor";

interface Hover {
  /** Hovered time in seconds. */
  time: number;
  /** X position of the preview card, relative to the outer wrapper (clamped). */
  cardX: number;
}

const PREVIEW_HALF = 72; // half the preview card's width, for edge clamping

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
  const wrapRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [hover, setHover] = useState<Hover | null>(null);
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

  // Position the floating preview card at the cursor, clamped so it doesn't
  // spill past the timeline's edges.
  function updateHover(clientX: number) {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const cardX = Math.min(
      rect.width - PREVIEW_HALF,
      Math.max(PREVIEW_HALF, clientX - rect.left),
    );
    setHover({ time: timeFromEvent(clientX), cardX });
  }

  function handlePointerDown(event: React.PointerEvent) {
    draggingRef.current = true;
    setHover(null);
    trackRef.current?.setPointerCapture(event.pointerId);
    const time = timeFromEvent(event.clientX);
    onSeek(time);
    const hit = segments.find((s) => time >= s.start && time < s.end);
    onSelect(hit ? hit.id : null);
  }

  function handlePointerMove(event: React.PointerEvent) {
    if (draggingRef.current) {
      onSeek(timeFromEvent(event.clientX));
      return;
    }
    // Only preview on a fine pointer (mouse); touch drives seeking instead.
    if (event.pointerType === "touch") return;
    updateHover(event.clientX);
  }

  function handlePointerUp(event: React.PointerEvent) {
    draggingRef.current = false;
    trackRef.current?.releasePointerCapture(event.pointerId);
  }

  const thumbIndex =
    duration > 0 && thumbnails.length > 0 && hover
      ? Math.min(
          thumbnails.length - 1,
          Math.max(0, Math.floor((hover.time / duration) * thumbnails.length)),
        )
      : -1;
  const previewSrc = thumbIndex >= 0 ? thumbnails[thumbIndex] : null;

  const gaps = gapsOf(segments, duration);

  return (
    <div ref={wrapRef} className="relative">
      {/* Hover scrubber preview — lives outside the scroll container so it can
          float above the timeline without being clipped. */}
      {hover && (
        <div
          className="pointer-events-none absolute bottom-full z-20 mb-2 -translate-x-1/2"
          style={{ left: hover.cardX }}
        >
          <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-[0_16px_40px_-16px_rgba(0,0,0,0.7)]">
            <div className="grid h-20 w-36 place-items-center bg-black">
              {previewSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewSrc}
                  alt=""
                  draggable={false}
                  className="h-full w-full object-cover"
                />
              ) : null}
            </div>
          </div>
          <div className="mt-1 text-center">
            <span className="rounded bg-surface/90 px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-foreground">
              {formatDuration(hover.time * 1000)}
            </span>
          </div>
        </div>
      )}

      <div
        ref={scrollRef}
        className="overflow-x-auto overflow-y-hidden rounded-lg border border-border bg-surface"
      >
        <div
          ref={trackRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={() => setHover(null)}
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

        {/* Hover indicator — a faint line tracking the cursor for scrubbing. */}
        {hover && (
          <div
            className="pointer-events-none absolute inset-y-0 z-10 w-px bg-foreground/40"
            style={{ left: Math.min(width - 1, hover.time * pxPerSec) }}
          />
        )}

        {/* Playhead */}
        <div
          className="pointer-events-none absolute inset-y-0 z-10 w-px bg-red"
          style={{ left: Math.min(width - 1, playhead * pxPerSec) }}
        >
          <span className="absolute top-0 -left-1.25 size-2.75 rounded-full border-2 border-background bg-red" />
        </div>
        </div>
      </div>
    </div>
  );
}
