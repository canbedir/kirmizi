"use client";

import { useRef } from "react";
import { CROP_MIN, clampCrop, type CropRegion } from "@/lib/scene";

// The rectangle you drag to say what the export is of.
//
// It sits over the whole capture — the stage stops showing the crop while
// this is open, because a rectangle can't be aimed at something it has
// already hidden. Everything is in fractions of the capture, so it survives
// the stage being any size.

type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "move";

const HANDLES: { id: Handle; x: number; y: number; cursor: string }[] = [
  { id: "nw", x: 0, y: 0, cursor: "nwse-resize" },
  { id: "n", x: 0.5, y: 0, cursor: "ns-resize" },
  { id: "ne", x: 1, y: 0, cursor: "nesw-resize" },
  { id: "e", x: 1, y: 0.5, cursor: "ew-resize" },
  { id: "se", x: 1, y: 1, cursor: "nwse-resize" },
  { id: "s", x: 0.5, y: 1, cursor: "ns-resize" },
  { id: "sw", x: 0, y: 1, cursor: "nesw-resize" },
  { id: "w", x: 0, y: 0.5, cursor: "ew-resize" },
];

/** Move one edge, keeping the opposite one where it is. */
function resize(start: CropRegion, handle: Handle, dx: number, dy: number): CropRegion {
  let { x, y, w, h } = start;
  const right = x + w;
  const bottom = y + h;

  if (handle.includes("w")) {
    x = Math.min(Math.max(0, start.x + dx), right - CROP_MIN);
    w = right - x;
  }
  if (handle.includes("e")) {
    w = Math.min(Math.max(CROP_MIN, start.w + dx), 1 - x);
  }
  if (handle.includes("n")) {
    y = Math.min(Math.max(0, start.y + dy), bottom - CROP_MIN);
    h = bottom - y;
  }
  if (handle.includes("s")) {
    h = Math.min(Math.max(CROP_MIN, start.h + dy), 1 - y);
  }
  return clampCrop({ x, y, w, h });
}

export function CropOverlay({
  crop,
  onChange,
  onCommit,
}: {
  crop: CropRegion;
  /** Called continuously while dragging. */
  onChange: (crop: CropRegion) => void;
  /** Called once when a drag finishes, for the undo history. */
  onCommit?: () => void;
}) {
  const drag = useRef<{
    handle: Handle;
    startX: number;
    startY: number;
    from: CropRegion;
    width: number;
    height: number;
  } | null>(null);

  // One handler, with the grip read off the element: building a handler per
  // grip would mean calling a function that closes over the drag ref while
  // rendering.
  const begin = (event: React.PointerEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const host = event.currentTarget.closest("[data-crop-host]") as HTMLElement | null;
    const box = host?.getBoundingClientRect();
    if (!box?.width || !box.height) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      handle: (event.currentTarget.dataset.handle ?? "move") as Handle,
      startX: event.clientX,
      startY: event.clientY,
      from: crop,
      width: box.width,
      height: box.height,
    };
  };

  const move = (event: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = (event.clientX - d.startX) / d.width;
    const dy = (event.clientY - d.startY) / d.height;
    onChange(
      d.handle === "move"
        ? clampCrop({ ...d.from, x: d.from.x + dx, y: d.from.y + dy })
        : resize(d.from, d.handle, dx, dy),
    );
  };

  const end = (event: React.PointerEvent) => {
    if (!drag.current) return;
    drag.current = null;
    try {
      (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    } catch {
      /* the pointer may already be gone */
    }
    onCommit?.();
  };

  const pct = (v: number) => `${v * 100}%`;
  const shade = "absolute bg-background/70";
  /** Grips sit inside the rectangle rather than straddling its edge: at the
   *  edge of the stage, half of one would be clipped away and unreachable. */
  const inset = (f: number) => (f === 0 ? "0%" : f === 1 ? "-100%" : "-50%");

  return (
    <div
      data-crop-host
      className="absolute inset-0 z-20 touch-none select-none"
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    >
      {/* Everything outside the crop, dimmed. Four panes rather than a hole,
          which keeps it to plain boxes. */}
      <div className={shade} style={{ left: 0, top: 0, right: 0, height: pct(crop.y) }} />
      <div
        className={shade}
        style={{ left: 0, top: pct(crop.y + crop.h), right: 0, bottom: 0 }}
      />
      <div
        className={shade}
        style={{ left: 0, top: pct(crop.y), width: pct(crop.x), height: pct(crop.h) }}
      />
      <div
        className={shade}
        style={{
          left: pct(crop.x + crop.w),
          top: pct(crop.y),
          right: 0,
          height: pct(crop.h),
        }}
      />

      {/* The crop itself: drag the body to move it. */}
      <div
        data-handle="move"
        onPointerDown={begin}
        className="absolute cursor-move border-2 border-red"
        style={{
          left: pct(crop.x),
          top: pct(crop.y),
          width: pct(crop.w),
          height: pct(crop.h),
        }}
      >
        {/* Thirds, the way a viewfinder does it. */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          {[1 / 3, 2 / 3].map((f) => (
            <div
              key={`v${f}`}
              className="absolute inset-y-0 w-px bg-white/25"
              style={{ left: pct(f) }}
            />
          ))}
          {[1 / 3, 2 / 3].map((f) => (
            <div
              key={`h${f}`}
              className="absolute inset-x-0 h-px bg-white/25"
              style={{ top: pct(f) }}
            />
          ))}
        </div>

        {HANDLES.map((handle) => (
          <span
            key={handle.id}
            data-handle={handle.id}
            onPointerDown={begin}
            role="presentation"
            className="absolute size-3.5 rounded-full border-2 border-red bg-background shadow-[0_1px_3px_rgba(0,0,0,0.6)]"
            style={{
              left: pct(handle.x),
              top: pct(handle.y),
              translate: `${inset(handle.x)} ${inset(handle.y)}`,
              cursor: handle.cursor,
            }}
          />
        ))}
      </div>
    </div>
  );
}
