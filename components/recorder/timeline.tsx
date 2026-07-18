"use client";

import { useEffect, useRef, useState } from "react";
import { MicOff, ZoomIn } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/format";
import type { Segment } from "@/lib/use-video-editor";
import type { ZoomRegion } from "@/lib/scene";

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
  zooms: ZoomRegion[];
  selectedId: string | null;
  selectedZoomId: string | null;
  playhead: number;
  pxPerSec: number;
  thumbnails: string[];
  onSeek: (time: number) => void;
  onSelect: (id: string | null) => void;
  onSelectZoom: (id: string | null) => void;
  /** Called once when a zoom drag actually starts moving (for undo). */
  onZoomDragStart: () => void;
  onZoomChange: (id: string, patch: { start?: number; end?: number }) => void;
}

interface ZoomDrag {
  id: string;
  mode: "move" | "left" | "right";
  originX: number;
  start: number;
  end: number;
  moved: boolean;
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
  zooms,
  selectedId,
  selectedZoomId,
  playhead,
  pxPerSec,
  thumbnails,
  onSeek,
  onSelect,
  onSelectZoom,
  onZoomDragStart,
  onZoomChange,
}: TimelineProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const zoomDragRef = useRef<ZoomDrag | null>(null);
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

  // --- zoom-region drags: move the pill, or resize it by an edge handle ---
  function beginZoomDrag(
    event: React.PointerEvent,
    zoom: ZoomRegion,
    mode: ZoomDrag["mode"],
  ) {
    event.stopPropagation();
    setHover(null);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    onSelectZoom(zoom.id);
    zoomDragRef.current = {
      id: zoom.id,
      mode,
      originX: event.clientX,
      start: zoom.start,
      end: zoom.end,
      moved: false,
    };
  }

  function moveZoomDrag(event: React.PointerEvent) {
    const drag = zoomDragRef.current;
    if (!drag) return;
    event.stopPropagation();
    const dx = event.clientX - drag.originX;
    if (!drag.moved) {
      if (Math.abs(dx) < 3) return;
      drag.moved = true;
      onZoomDragStart();
    }
    const dt = dx / pxPerSec;
    if (drag.mode === "move") {
      onZoomChange(drag.id, { start: drag.start + dt, end: drag.end + dt });
    } else if (drag.mode === "left") {
      onZoomChange(drag.id, { start: drag.start + dt });
    } else {
      onZoomChange(drag.id, { end: drag.end + dt });
    }
  }

  function endZoomDrag(event: React.PointerEvent) {
    if (!zoomDragRef.current) return;
    event.stopPropagation();
    zoomDragRef.current = null;
    (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
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

        {/* Zoom regions — draggable pills overlaid along the top edge. */}
        {zooms.map((zoom) => {
          const selected = zoom.id === selectedZoomId;
          return (
            <div
              key={zoom.id}
              onPointerDown={(e) => beginZoomDrag(e, zoom, "move")}
              onPointerMove={moveZoomDrag}
              onPointerUp={endZoomDrag}
              className={cn(
                "absolute top-1 z-5 flex h-5 cursor-grab items-center gap-1 overflow-hidden rounded-md border px-1.5 backdrop-blur-sm select-none active:cursor-grabbing",
                selected
                  ? "border-red bg-red/20 text-foreground"
                  : "border-foreground/25 bg-background/60 text-muted-foreground hover:border-foreground/50",
              )}
              style={{
                left: zoom.start * pxPerSec,
                width: Math.max(14, (zoom.end - zoom.start) * pxPerSec),
              }}
            >
              <ZoomIn className="size-3 shrink-0" />
              <span className="truncate font-mono text-[10px]">
                {zoom.scale.toFixed(1)}×
              </span>
              {/* Edge handles for resizing. */}
              <div
                onPointerDown={(e) => beginZoomDrag(e, zoom, "left")}
                onPointerMove={moveZoomDrag}
                onPointerUp={endZoomDrag}
                className={cn(
                  "absolute inset-y-0 left-0 w-1.5 cursor-ew-resize",
                  selected && "bg-red/60",
                )}
              />
              <div
                onPointerDown={(e) => beginZoomDrag(e, zoom, "right")}
                onPointerMove={moveZoomDrag}
                onPointerUp={endZoomDrag}
                className={cn(
                  "absolute inset-y-0 right-0 w-1.5 cursor-ew-resize",
                  selected && "bg-red/60",
                )}
              />
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
