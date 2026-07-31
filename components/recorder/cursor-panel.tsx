"use client";

import {
  MousePointer2,
  Sparkles,
  Volume2,
  VolumeX,
  Waves,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { CursorStyle } from "@/lib/cursor-track";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

// Controls for what the recorded pointer data is used for. Click effects and
// auto zoom add something the capture doesn't already have; the synthetic
// pointer is opt-in because the system one is always in the video too.

function sliderValue(value: number | readonly number[]): number {
  return Array.isArray(value) ? (value[0] as number) : (value as number);
}

export function CursorPanel({
  style,
  clickCount,
  zoomCount,
  diagnostics,
  onChange,
}: {
  style: CursorStyle;
  clickCount: number;
  zoomCount: number;
  /** Temporary: raw capture + first-click figures, for chasing misplacement. */
  diagnostics?: string;
  onChange: (style: CursorStyle) => void;
}) {
  // Say what happened rather than leaving a lit-up button doing nothing.
  const note =
    style.autoZoom && zoomCount === 0
      ? clickCount === 0
        ? "Nothing to zoom into — the pointer kept moving and never settled, and no clicks were recorded. Only clicks inside a page are captured, not ones on the browser's own toolbar or another app."
        : "No moment stood out enough to zoom into. Add one yourself with the Zoom button."
      : style.sound && clickCount === 0
        ? "No clicks were recorded, so there's nothing for the click sound to play on."
        : null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
          Cursor
        </span>

        <Button
          size="sm"
          variant="outline"
          onClick={() => onChange({ ...style, autoZoom: !style.autoZoom })}
          aria-pressed={style.autoZoom}
          className={cn(
            "gap-1.5",
            style.autoZoom && "border-red text-red",
          )}
        >
          <Sparkles className="size-3.5" />
          Auto zoom
          {style.autoZoom && zoomCount > 0 && (
            <span className="font-mono text-[11px] opacity-70">
              {zoomCount}
            </span>
          )}
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={() => onChange({ ...style, clicks: !style.clicks })}
          aria-pressed={style.clicks}
          className={cn("gap-1.5", style.clicks && "border-red text-red")}
        >
          Clicks
          <span className="font-mono text-[11px] opacity-70">{clickCount}</span>
        </Button>

        <Button
          size="icon"
          variant="ghost"
          onClick={() => onChange({ ...style, sound: !style.sound })}
          aria-label={style.sound ? "Mute click sound" : "Add click sound"}
          title={style.sound ? "Click sound on" : "Click sound off"}
          className={cn(style.sound && "text-red")}
        >
          {style.sound ? (
            <Volume2 className="size-4" />
          ) : (
            <VolumeX className="size-4" />
          )}
        </Button>

        <span className="mx-1 h-5 w-px bg-border" />

        <Button
          size="sm"
          variant="outline"
          onClick={() => onChange({ ...style, show: !style.show })}
          aria-pressed={style.show}
          aria-label="Draw a synthetic pointer"
          title="Your system pointer is already in the recording — this draws a second, smoothed one over it."
          className={cn("gap-1.5", style.show && "border-red text-red")}
        >
          <MousePointer2 className="size-3.5" />
          Redraw pointer
        </Button>
      </div>

      {note && (
        <p className="font-mono text-[11px] leading-relaxed text-muted-foreground/80">
          {note}
        </p>
      )}

      {diagnostics && (
        <p className="rounded border border-border/60 bg-background/40 p-2 font-mono text-[10px] leading-relaxed wrap-break-word text-muted-foreground/70">
          {diagnostics}
        </p>
      )}

      {style.show && (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:gap-5">
            <label className="flex min-w-0 flex-1 items-center gap-2">
              <span className="w-16 shrink-0 font-mono text-[11px] text-muted-foreground">
                size
              </span>
              <Slider
                value={[style.size]}
                min={0.02}
                max={0.09}
                step={0.005}
                onValueChange={(v) =>
                  onChange({ ...style, size: sliderValue(v) })
                }
              />
            </label>
            <label className="flex min-w-0 flex-1 items-center gap-2">
              <span className="flex w-16 shrink-0 items-center gap-1 font-mono text-[11px] text-muted-foreground">
                <Waves className="size-3" />
                smooth
              </span>
              <Slider
                value={[style.smoothing]}
                min={0}
                max={1}
                step={0.05}
                onValueChange={(v) =>
                  onChange({ ...style, smoothing: sliderValue(v) })
                }
              />
            </label>
          </div>
          <label className="flex items-center gap-2 font-mono text-[11px] leading-relaxed text-muted-foreground/80">
            <input
              type="checkbox"
              checked={style.cover}
              onChange={() => onChange({ ...style, cover: !style.cover })}
              className="size-3.5 accent-red"
            />
            Paint over the captured cursor. Browsers can&apos;t leave the
            system pointer out of a recording, so this hides it — turn it off
            if the patch shows over busy detail.
          </label>
        </>
      )}
    </div>
  );
}
