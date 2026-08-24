"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { isLight, mix } from "@/lib/color";
import {
  MAX_STOPS,
  backgroundCss,
  gradientFrom,
  spreadStops,
  type Background,
} from "@/lib/scene";
import { ColorPicker } from "@/components/ui/color-picker";

// Building a background by hand.
//
// There are no modes here, which is the point: one colour is a flat
// background, and adding a second makes it a gradient. Nothing has to be
// chosen up front and nothing is lost on the way between the two.

/** The colours a background is made of, whichever kind it is. */
function colorsOf(bg: Background): string[] {
  if (bg.kind === "solid") return [bg.color];
  if (bg.kind === "linear") return bg.stops.map((s) => s.color);
  return [];
}

function withColor(bg: Background, index: number, color: string): Background {
  if (bg.kind === "solid") return { kind: "solid", color };
  if (bg.kind !== "linear") return bg;
  return {
    ...bg,
    stops: bg.stops.map((s, i) => (i === index ? { ...s, color } : s)),
  };
}

function addStop(bg: Background): Background {
  // The first colour on its own becomes a gradient into a darker version of
  // itself — a sensible thing to have appeared, and a starting point to move.
  if (bg.kind === "solid") return gradientFrom(bg.color);
  if (bg.kind !== "linear" || bg.stops.length >= MAX_STOPS) return bg;
  const first = bg.stops[0];
  const last = bg.stops[bg.stops.length - 1];
  return {
    ...bg,
    stops: [
      first,
      { offset: (first.offset + last.offset) / 2, color: mix(first.color, last.color, 0.5) },
      last,
    ],
  };
}

function removeStop(bg: Background, index: number): Background {
  if (bg.kind !== "linear") return bg;
  const rest = bg.stops.filter((_, i) => i !== index);
  // Down to one colour is a flat background again, not a gradient with a hole.
  if (rest.length < 2) {
    return { kind: "solid", color: rest[0]?.color ?? bg.stops[0].color };
  }
  return { ...bg, stops: spreadStops(rest) };
}

/* ---------------------------------------------------------------- */

/** Snap an angle to a step, and harder still to the eight compass points. */
function snapAngle(degrees: number): number {
  const wrapped = ((Math.round(degrees) % 360) + 360) % 360;
  const cardinal = Math.round(wrapped / 45) * 45;
  if (Math.abs(wrapped - cardinal) <= 7) return cardinal % 360;
  return (Math.round(wrapped / 15) * 15) % 360;
}

function AngleDial({
  value,
  onChange,
}: {
  value: number;
  onChange: (angle: number) => void;
}) {
  // CSS angles point up at zero and turn clockwise, so the handle is placed
  // with sin/-cos rather than the usual cos/sin.
  const rad = (value * Math.PI) / 180;
  const x = 50 + Math.sin(rad) * 34;
  const y = 50 - Math.cos(rad) * 34;

  const aim = (event: React.PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const dx = event.clientX - (box.left + box.width / 2);
    const dy = event.clientY - (box.top + box.height / 2);
    if (!dx && !dy) return;
    onChange(snapAngle((Math.atan2(dx, -dy) * 180) / Math.PI));
  };

  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
        Angle
      </span>
      <div
        role="slider"
        tabIndex={0}
        aria-label="Gradient direction"
        aria-valuemin={0}
        aria-valuemax={359}
        aria-valuenow={value}
        aria-valuetext={`${value} degrees`}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          aim(e);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) aim(e);
        }}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 45 : 15;
          if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
            onChange(((value - step) % 360 + 360) % 360);
          } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
            onChange((value + step) % 360);
          } else return;
          e.preventDefault();
        }}
        className="relative size-11 shrink-0 cursor-grab touch-none rounded-full border border-border bg-background outline-none active:cursor-grabbing focus-visible:border-red"
      >
        {/* A needle, not a loose dot: the direction is the whole point, and
            two unconnected dots don't read as one. */}
        <svg
          aria-hidden
          viewBox="0 0 100 100"
          className="absolute inset-0 size-full overflow-visible"
        >
          <line
            x1="50"
            y1="50"
            x2={x}
            y2={y}
            className="stroke-red"
            strokeWidth={7}
            strokeLinecap="round"
          />
          <circle cx="50" cy="50" r="7" className="fill-muted-foreground/60" />
        </svg>
      </div>
      <span className="w-9 font-mono text-[11px] text-muted-foreground tabular-nums">
        {value}°
      </span>
    </div>
  );
}

/* ---------------------------------------------------------------- */

export function BackgroundEditor({
  value,
  onChange,
  suggestions,
}: {
  value: Background;
  onChange: (bg: Background) => void;
  /** Colours taken from the clip, offered inside the picker. */
  suggestions?: string[];
}) {
  const colors = colorsOf(value);
  const [selected, setSelected] = useState(0);

  if (!colors.length) return null;
  // Clamped here rather than corrected in state: removing a colour, or a
  // preset arriving with fewer, can leave the selection past the end, and
  // there's nothing to be gained from writing that back.
  const index = Math.min(selected, colors.length - 1);
  const gradient = value.kind === "linear";

  return (
    <div className="flex flex-col gap-4 rounded-md border border-border bg-background/40 p-3">
      <ColorPicker
        value={colors[index]}
        onChange={(color) => onChange(withColor(value, index, color))}
        className="w-full shrink-0"
      />

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-0.5 font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
            Colours
          </span>
          {colors.map((color, i) => (
            <span key={i} className="group relative">
              <button
                type="button"
                aria-label={`Colour ${i + 1}: ${color}`}
                aria-pressed={i === index}
                onClick={() => setSelected(i)}
                className={cn(
                  "block size-7 rounded-md border transition-shadow",
                  i === index
                    ? "border-red ring-2 ring-red/40"
                    : "border-border hover:border-foreground/40",
                )}
                style={{ background: color }}
              />
              {colors.length > 1 && (
                <button
                  type="button"
                  aria-label={`Remove colour ${i + 1}`}
                  onClick={() => {
                    onChange(removeStop(value, i));
                    setSelected(0);
                  }}
                  className={cn(
                    "absolute -top-1 -right-1 grid size-3.5 place-items-center rounded-full border border-border bg-surface opacity-0 transition-opacity hover:opacity-100 focus-visible:opacity-100",
                    "group-hover:opacity-100",
                  )}
                >
                  <X className="size-2.5" />
                </button>
              )}
            </span>
          ))}
          {colors.length < MAX_STOPS && (
            <button
              type="button"
              aria-label="Add a colour, making it a gradient"
              title={gradient ? "Add a colour" : "Add a colour — makes it a gradient"}
              onClick={() => {
                onChange(addStop(value));
                setSelected(1);
              }}
              className="grid size-7 place-items-center rounded-md border border-border border-dashed text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
            >
              <Plus className="size-3.5" />
            </button>
          )}
        </div>

        {suggestions && suggestions.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-0.5 font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
              From the clip
            </span>
            {suggestions.map((color) => (
              <button
                key={color}
                type="button"
                title={color}
                aria-label={`Use ${color}, taken from the clip`}
                onClick={() => onChange(withColor(value, index, color))}
                className="size-7 rounded-md border border-border transition-transform hover:scale-105"
                style={{ background: color }}
              />
            ))}
          </div>
        )}

        {gradient && (
          <AngleDial
            value={value.angle}
            onChange={(angle) => onChange({ ...value, angle })}
          />
        )}

        {/* What the frame will be, at the size there's room for. */}
        <span
          aria-hidden
          className={cn(
            "min-h-8 w-full flex-1 rounded-md border border-border",
            isLight(colors[0]) && "border-foreground/20",
          )}
          style={{ background: backgroundCss(value) }}
        />
      </div>
    </div>
  );
}
