"use client";

import { Eye, EyeOff, MousePointer2, Volume2, Waves } from "lucide-react";
import { cn } from "@/lib/cn";
import type { CursorStyle } from "@/lib/cursor-track";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

// Controls for the redrawn pointer. The recording itself has no cursor in it
// when the companion is running — everything here is drawn at export time,
// so size, smoothing, and click effects stay editable after the fact.

function sliderValue(value: number | readonly number[]): number {
  return Array.isArray(value) ? (value[0] as number) : (value as number);
}

export function CursorPanel({
  style,
  clickCount,
  onChange,
}: {
  style: CursorStyle;
  clickCount: number;
  onChange: (style: CursorStyle) => void;
}) {
  const off = !style.show;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface/60 p-3">
      <span className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
        Cursor
      </span>

      <Button
        size="icon"
        variant="ghost"
        onClick={() => onChange({ ...style, show: !style.show })}
        aria-label={style.show ? "Hide cursor" : "Show cursor"}
        aria-pressed={style.show}
        className={cn(style.show && "text-red")}
      >
        {style.show ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
      </Button>

      <div className="flex min-w-28 flex-1 items-center gap-2">
        <MousePointer2
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground",
            off && "opacity-40",
          )}
        />
        <Slider
          value={[style.size]}
          min={0.02}
          max={0.09}
          step={0.005}
          disabled={off}
          onValueChange={(v) => onChange({ ...style, size: sliderValue(v) })}
        />
      </div>

      <div className="flex min-w-28 flex-1 items-center gap-2">
        <Waves
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground",
            off && "opacity-40",
          )}
        />
        <Slider
          value={[style.smoothing]}
          min={0}
          max={1}
          step={0.05}
          disabled={off}
          onValueChange={(v) =>
            onChange({ ...style, smoothing: sliderValue(v) })
          }
        />
      </div>

      <Button
        size="sm"
        variant="outline"
        onClick={() => onChange({ ...style, clicks: !style.clicks })}
        aria-pressed={style.clicks}
        disabled={off}
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
        aria-pressed={style.sound}
        title={style.sound ? "Click sound on" : "Click sound off"}
        className={cn(style.sound && "text-red")}
      >
        <Volume2 className="size-4" />
      </Button>
    </div>
  );
}
