"use client";

import { MousePointerClick, Sparkles, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/cn";
import type { CursorMiss, CursorStyle } from "@/lib/cursor-track";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

// What the recorded pointer data is used for. The pointer itself is left
// exactly as captured — see the note in lib/cursor-track.ts for why redrawing
// it can't work in a browser.

function sliderValue(value: number | readonly number[]): number {
  return Array.isArray(value) ? (value[0] as number) : (value as number);
}

/**
 * Why the pointer couldn't be put on the frame, in the terms of the surface.
 *
 * A window fails one way — the clicks were in a different one. A screen fails
 * two, and they aren't worth separating for a reader: either the pointer was
 * on another monitor, or it crossed between them often enough that nothing
 * says which one the recording is of.
 */
function unplaceableOn(surface?: string): string {
  if (surface === "window") {
    return "none of it could be placed on the window in the frame — it was in a different one.";
  }
  if (surface === "monitor") {
    return "none of it could be placed on the screen in the frame — it was on another one, or moved between them.";
  }
  return "none of it could be placed on what was captured.";
}

/**
 * What the clicks panel says instead of being missing.
 *
 * The panel used to just not be there, which reads as a bug whatever the
 * reason was. Each of these has something the person could do differently
 * next time, so each of them says what that is.
 */
export function CursorMissNote({
  miss,
  surface,
}: {
  miss: CursorMiss;
  surface?: string;
}) {
  const note =
    miss === "surface"
      ? "The browser didn't say what it was capturing, so a click can't be matched to a place in the frame."
      : miss === "nothing"
        ? "No clicks were recorded. Only what happens inside a page is collected — not the browser's own toolbar, and not another app."
        : `The pointer was recorded, but ${unplaceableOn(surface)}`;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface/60 p-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="mr-1 font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
          Clicks
        </span>
        <span className="max-w-prose flex-1 font-mono text-[11px] leading-relaxed text-muted-foreground/80">
          {note}
        </span>
      </div>
    </div>
  );
}

export function CursorPanel({
  style,
  clickCount,
  zoomCount,
  onChange,
}: {
  style: CursorStyle;
  clickCount: number;
  zoomCount: number;
  onChange: (style: CursorStyle) => void;
}) {
  const note =
    style.autoZoom && zoomCount === 0
      ? clickCount === 0
        ? "Nothing to zoom into — the pointer kept moving and never settled, and no clicks were recorded. Only clicks inside a page are captured, not ones on the browser's own toolbar or another app."
        : "No moment stood out enough to zoom into. Add one yourself with the Zoom button."
      : clickCount === 0 && (style.clicks || style.sound)
        ? "No clicks were recorded, so there's nothing to mark."
        : null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
          Clicks
        </span>

        <Button
          size="sm"
          variant="outline"
          onClick={() => onChange({ ...style, autoZoom: !style.autoZoom })}
          aria-pressed={style.autoZoom}
          className={cn("gap-1.5", style.autoZoom && "border-red text-red")}
        >
          <Sparkles className="size-3.5" />
          Auto zoom
          {style.autoZoom && zoomCount > 0 && (
            <span className="font-mono text-[11px] opacity-70">{zoomCount}</span>
          )}
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={() => onChange({ ...style, clicks: !style.clicks })}
          aria-pressed={style.clicks}
          className={cn("gap-1.5", style.clicks && "border-red text-red")}
        >
          <MousePointerClick className="size-3.5" />
          Highlight
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

        {style.clicks && (
          <label className="flex min-w-32 flex-1 items-center gap-2">
            <span className="font-mono text-[11px] text-muted-foreground">
              size
            </span>
            <Slider
              value={[style.size]}
              min={0.015}
              max={0.06}
              step={0.0025}
              onValueChange={(v) => onChange({ ...style, size: sliderValue(v) })}
            />
          </label>
        )}
      </div>

      {note && (
        <p className="font-mono text-[11px] leading-relaxed text-muted-foreground/80">
          {note}
        </p>
      )}
    </div>
  );
}
