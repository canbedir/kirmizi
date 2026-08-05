"use client";

import { Ban, Crop, RotateCcw } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  ASPECTS,
  BACKGROUNDS,
  FULL_CROP,
  aspectById,
  fitCrop,
  isFullCrop,
  type CropRegion,
  type FrameStyle,
} from "@/lib/scene";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";

// Styling controls for the frame drawn around the recording: background
// preset swatches plus padding / corner / shadow sliders. Purely local state
// lifted to the editor; nothing here touches the recording itself.

function sliderValue(value: number | readonly number[]): number {
  return Array.isArray(value) ? (value[0] as number) : (value as number);
}

function LabeledSlider({
  label,
  value,
  min,
  max,
  step,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex min-w-0 flex-1 items-center gap-2">
      <span
        className={cn(
          "w-14 shrink-0 font-mono text-[11px] text-muted-foreground",
          disabled && "opacity-40",
        )}
      >
        {label}
      </span>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onValueChange={(v) => onChange(sliderValue(v))}
      />
    </label>
  );
}

/** A little outline of the shape the export will be. */
function AspectMark({ ratio }: { ratio: number | null }) {
  // The source keeps whatever was captured, so it has no fixed shape to draw.
  if (ratio === null) {
    return (
      <span className="block size-3 rounded-xs border border-current border-dashed" />
    );
  }
  const w = ratio >= 1 ? 14 : 14 * ratio;
  const h = ratio >= 1 ? 14 / ratio : 14;
  return (
    <span
      className="block rounded-xs border border-current"
      style={{ width: w, height: h }}
    />
  );
}

export function FramePanel({
  style,
  onChange,
  crop,
  cropping,
  source,
  onToggleCrop,
  onCrop,
}: {
  style: FrameStyle;
  onChange: (style: FrameStyle) => void;
  crop: CropRegion;
  cropping: boolean;
  /** The capture's own dimensions, which a shape is fitted against. */
  source: { w: number; h: number };
  onToggleCrop: () => void;
  onCrop: (crop: CropRegion) => void;
}) {
  const plain = style.background === "none";
  const aspect = aspectById(style.aspect);
  const cropped = !isFullCrop(crop);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface/60 p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
          Frame
        </span>
        {BACKGROUNDS.map((bg) => {
          const active = style.background === bg.id;
          return (
            <button
              key={bg.id}
              type="button"
              title={bg.label}
              aria-label={`Background: ${bg.label}`}
              aria-pressed={active}
              onClick={() => onChange({ ...style, background: bg.id })}
              className={cn(
                "grid size-7 place-items-center rounded-md border transition-shadow",
                active
                  ? "border-red ring-2 ring-red/40"
                  : "border-border hover:border-foreground/40",
              )}
              style={
                bg.id === "none" ? undefined : { background: bg.css }
              }
            >
              {bg.id === "none" && (
                <Ban className="size-3.5 text-muted-foreground" />
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
          Shape
        </span>
        {ASPECTS.map((preset) => {
          const active = style.aspect === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              aria-label={`Shape: ${preset.label}`}
              aria-pressed={active}
              onClick={() => onChange({ ...style, aspect: preset.id })}
              className={cn(
                "flex h-7 items-center gap-1.5 rounded-md border px-2 font-mono text-[11px] transition-colors",
                active
                  ? "border-red text-red"
                  : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground",
              )}
            >
              <AspectMark ratio={preset.ratio} />
              {preset.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
          Crop
        </span>

        <Button
          size="sm"
          variant="outline"
          onClick={onToggleCrop}
          aria-pressed={cropping}
          className={cn("gap-1.5", cropping && "border-red text-red")}
          title="Choose the part of the screen the clip is of"
        >
          <Crop className="size-3.5" />
          {cropping ? "Done" : "Choose area"}
        </Button>

        {aspect.ratio !== null && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onCrop(fitCrop(source.w, source.h, aspect.ratio))}
            className="gap-1.5 font-mono text-[11px]"
            title={`Take the biggest ${aspect.label} area out of the screen`}
          >
            Fill {aspect.label}
          </Button>
        )}

        {cropped && (
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onCrop(FULL_CROP)}
            aria-label="Use the whole screen"
            title="Use the whole screen"
          >
            <RotateCcw className="size-4" />
          </Button>
        )}

        <span className="ml-auto font-mono text-[11px] text-muted-foreground/80">
          {cropping
            ? "drag the rectangle, then Done"
            : cropped
              ? `${Math.round(crop.w * 100)}% × ${Math.round(crop.h * 100)}% of the screen`
              : aspect.ratio !== null && plain
                ? "pick a background, or crop to fill the shape"
                : "the whole screen"}
        </span>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:gap-5">
        <LabeledSlider
          label="padding"
          value={style.padding}
          min={0}
          max={0.16}
          step={0.005}
          disabled={plain}
          onChange={(padding) => onChange({ ...style, padding })}
        />
        <LabeledSlider
          label="corners"
          value={style.radius}
          min={0}
          max={0.12}
          step={0.005}
          disabled={plain}
          onChange={(radius) => onChange({ ...style, radius })}
        />
        <LabeledSlider
          label="shadow"
          value={style.shadow}
          min={0}
          max={1}
          step={0.05}
          disabled={plain}
          onChange={(shadow) => onChange({ ...style, shadow })}
        />
      </div>
    </div>
  );
}
