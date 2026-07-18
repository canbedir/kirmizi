"use client";

import { Ban, Circle, Eye, EyeOff, FlipHorizontal2, Square } from "lucide-react";
import { cn } from "@/lib/cn";
import type { CameraLayout } from "@/lib/camera-layout";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

// Styling controls for the recorded webcam bubble: shape, mirror, size,
// border, and visibility. Position is set by dragging the bubble on the
// preview. All of it is applied at export time — nothing is burned in.

const BORDER_SWATCHES: { id: string; color: string | null }[] = [
  { id: "none", color: null },
  { id: "white", color: "#ffffff" },
  { id: "dark", color: "#1b1815" },
  { id: "red", color: "#f62d22" },
];

function sliderValue(value: number | readonly number[]): number {
  return Array.isArray(value) ? (value[0] as number) : (value as number);
}

export function CameraPanel({
  layout,
  hidden,
  onChange,
  onToggleHidden,
}: {
  layout: CameraLayout;
  hidden: boolean;
  onChange: (layout: CameraLayout) => void;
  onToggleHidden: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface/60 p-3">
      <span className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
        Camera
      </span>

      <div className="flex items-center gap-1">
        <Button
          size="icon"
          variant={layout.shape === "circle" ? "outline" : "ghost"}
          onClick={() => onChange({ ...layout, shape: "circle" })}
          disabled={hidden}
          aria-label="Circle bubble"
          aria-pressed={layout.shape === "circle"}
          className={cn(layout.shape === "circle" && "border-red text-red")}
        >
          <Circle className="size-4" />
        </Button>
        <Button
          size="icon"
          variant={layout.shape === "rounded" ? "outline" : "ghost"}
          onClick={() => onChange({ ...layout, shape: "rounded" })}
          disabled={hidden}
          aria-label="Rounded bubble"
          aria-pressed={layout.shape === "rounded"}
          className={cn(layout.shape === "rounded" && "border-red text-red")}
        >
          <Square className="size-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => onChange({ ...layout, mirror: !layout.mirror })}
          disabled={hidden}
          aria-label="Mirror camera"
          aria-pressed={layout.mirror}
          className={cn(layout.mirror && "text-red")}
        >
          <FlipHorizontal2 className="size-4" />
        </Button>
      </div>

      <div className="flex min-w-32 flex-1 items-center gap-2">
        <span
          className={cn(
            "font-mono text-[11px] text-muted-foreground",
            hidden && "opacity-40",
          )}
        >
          size
        </span>
        <Slider
          value={[layout.size]}
          min={0.1}
          max={0.45}
          step={0.01}
          disabled={hidden}
          onValueChange={(v) => onChange({ ...layout, size: sliderValue(v) })}
        />
      </div>

      <div className="flex items-center gap-1">
        {BORDER_SWATCHES.map((swatch) => {
          const active = layout.borderColor === swatch.color;
          return (
            <button
              key={swatch.id}
              type="button"
              title={`Border: ${swatch.id}`}
              aria-label={`Border: ${swatch.id}`}
              aria-pressed={active}
              disabled={hidden}
              onClick={() => onChange({ ...layout, borderColor: swatch.color })}
              className={cn(
                "grid size-6 place-items-center rounded-full border transition-shadow disabled:opacity-40",
                active
                  ? "border-red ring-2 ring-red/40"
                  : "border-border hover:border-foreground/40",
              )}
              style={
                swatch.color ? { background: swatch.color } : undefined
              }
            >
              {!swatch.color && (
                <Ban className="size-3 text-muted-foreground" />
              )}
            </button>
          );
        })}
      </div>

      <Button
        size="icon"
        variant="ghost"
        onClick={onToggleHidden}
        aria-label={hidden ? "Show camera" : "Hide camera"}
        aria-pressed={hidden}
        className={cn(hidden && "text-red")}
      >
        {hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </Button>

      <span className="hidden w-full font-mono text-[11px] text-muted-foreground/70 sm:block">
        drag the bubble in the preview to move it
      </span>
    </div>
  );
}
