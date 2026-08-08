"use client";

import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import {
  formatHex,
  hsvToRgb,
  isLight,
  parseHex,
  rgbToHsv,
  type Hsv,
} from "@/lib/color";

// Saturation/value square, hue strip, hex field. Everything a colour needs and
// nothing it doesn't.

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * Pointer dragging over a box, reported as a fraction of it.
 *
 * Capture matters more than it looks: without it a drag that leaves the square
 * — which is most of them, because you aim past the corner to reach pure white
 * — stops updating the moment the pointer crosses the edge.
 */
function useDrag(onMove: (fx: number, fy: number) => void) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const report = useCallback(
    (event: { clientX: number; clientY: number }) => {
      const box = ref.current?.getBoundingClientRect();
      if (!box || !box.width || !box.height) return;
      onMove(
        clamp01((event.clientX - box.left) / box.width),
        clamp01((event.clientY - box.top) / box.height),
      );
    },
    [onMove],
  );

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    report(event);
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragging.current) report(event);
  };
  const stop = (event: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return { ref, onPointerDown, onPointerMove, onPointerUp: stop, onPointerCancel: stop };
}

export function ColorPicker({
  value,
  onChange,
  className,
}: {
  /** Hex, with or without the hash. */
  value: string;
  onChange: (hex: string) => void;
  className?: string;
}) {
  // Held as HSV rather than re-derived from the hex on every render: black has
  // no hue and full-black has no saturation either, so a round trip through
  // the colour would throw away where the pointer is and snap it home the
  // moment a drag reached an edge.
  const [hsv, setHsv] = useState<Hsv>(() =>
    rgbToHsv(parseHex(value) ?? { r: 0, g: 0, b: 0 }),
  );
  const [text, setText] = useState(value);

  const emit = useCallback(
    (next: Hsv) => {
      setHsv(next);
      const hex = formatHex(hsvToRgb(next));
      setText(hex);
      onChange(hex);
    },
    [onChange],
  );

  // Follow the value when it's changed from outside — switching to a different
  // gradient stop, or a preset arriving — but not when it's our own doing.
  // Adjusted while rendering rather than in an effect: an effect would paint
  // the old colour first and then correct it.
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    const rgb = parseHex(value);
    if (rgb && formatHex(hsvToRgb(hsv)) !== formatHex(rgb)) {
      setHsv(rgbToHsv(rgb));
      setText(formatHex(rgb));
    }
  }

  const square = useDrag((fx, fy) => emit({ ...hsv, s: fx, v: 1 - fy }));
  const strip = useDrag((fx) => emit({ ...hsv, h: fx * 360 }));

  const hue = formatHex(hsvToRgb({ h: hsv.h, s: 1, v: 1 }));
  const current = formatHex(hsvToRgb(hsv));

  const nudge = (event: React.KeyboardEvent) => {
    const step = event.shiftKey ? 0.1 : 0.02;
    const moves: Record<string, Partial<Hsv>> = {
      ArrowLeft: { s: clamp01(hsv.s - step) },
      ArrowRight: { s: clamp01(hsv.s + step) },
      ArrowUp: { v: clamp01(hsv.v + step) },
      ArrowDown: { v: clamp01(hsv.v - step) },
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    emit({ ...hsv, ...move });
  };

  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      <div
        {...square}
        role="slider"
        tabIndex={0}
        aria-label="Saturation and brightness"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(hsv.s * 100)}
        aria-valuetext={`${Math.round(hsv.s * 100)}% saturation, ${Math.round(hsv.v * 100)}% brightness`}
        onKeyDown={nudge}
        className="relative aspect-4/3 w-full cursor-crosshair touch-none rounded-md outline-none ring-offset-2 ring-offset-surface focus-visible:ring-2 focus-visible:ring-red/50"
        style={{
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hue})`,
        }}
      >
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 shadow-[0_1px_4px_rgba(0,0,0,0.5)]",
            isLight(current) ? "border-black/70" : "border-white",
          )}
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}
        />
      </div>

      <div
        {...strip}
        role="slider"
        tabIndex={0}
        aria-label="Hue"
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={Math.round(hsv.h)}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 30 : 4;
          if (e.key === "ArrowLeft") emit({ ...hsv, h: (hsv.h - step + 360) % 360 });
          else if (e.key === "ArrowRight") emit({ ...hsv, h: (hsv.h + step) % 360 });
          else return;
          e.preventDefault();
        }}
        className="relative h-3.5 w-full cursor-ew-resize touch-none rounded-full outline-none ring-offset-2 ring-offset-surface focus-visible:ring-2 focus-visible:ring-red/50"
        style={{
          background:
            "linear-gradient(to right, #f00, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00)",
        }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_1px_4px_rgba(0,0,0,0.5)]"
          style={{ left: `${(hsv.h / 360) * 100}%`, background: hue }}
        />
      </div>

      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="size-6 shrink-0 rounded-md border border-border"
          style={{ background: current }}
        />
        <input
          value={text}
          aria-label="Hex colour"
          spellCheck={false}
          onChange={(e) => {
            setText(e.target.value);
            // Applied as soon as it reads as a colour, so typing shows.
            const rgb = parseHex(e.target.value);
            if (rgb) {
              setHsv(rgbToHsv(rgb));
              onChange(formatHex(rgb));
            }
          }}
          // Half-typed input is left alone while it's being typed; on the way
          // out it either was a colour or goes back to the one in force.
          onBlur={() => setText(current)}
          className="h-7 min-w-0 flex-1 rounded-md border border-border bg-background px-2 font-mono text-[11px] uppercase outline-none focus-visible:border-red"
        />
      </div>
    </div>
  );
}
