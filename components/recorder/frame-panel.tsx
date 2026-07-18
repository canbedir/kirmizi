"use client";

import { Ban } from "lucide-react";
import { cn } from "@/lib/cn";
import { BACKGROUNDS, type FrameStyle } from "@/lib/scene";
import { Slider } from "@/components/ui/slider";

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

export function FramePanel({
  style,
  onChange,
}: {
  style: FrameStyle;
  onChange: (style: FrameStyle) => void;
}) {
  const plain = style.background === "none";

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
