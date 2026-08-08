"use client";

import { useState } from "react";
import { Ban, Crop, Image as ImageIcon, Loader2, Pipette, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import {
  ASPECTS,
  BACKGROUND_PRESETS,
  FULL_CROP,
  NO_BACKGROUND,
  aspectById,
  backgroundCss,
  fitCrop,
  isFullCrop,
  presetOf,
  sameBackground,
  type Background,
  type CropRegion,
  type FrameStyle,
} from "@/lib/scene";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { BackgroundEditor } from "@/components/recorder/background-editor";
import { prepareBackgroundPicture } from "@/lib/picture";

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

/** Where a custom background starts from, when there's nothing to start from. */
const FIRST_CUSTOM: Background = { kind: "solid", color: "#1d4ed8" };

export function FramePanel({
  style,
  onChange,
  crop,
  cropping,
  source,
  onToggleCrop,
  onCrop,
  sampleColors,
}: {
  style: FrameStyle;
  onChange: (style: FrameStyle) => void;
  crop: CropRegion;
  cropping: boolean;
  /** The capture's own dimensions, which a shape is fitted against. */
  source: { w: number; h: number };
  onToggleCrop: () => void;
  onCrop: (crop: CropRegion) => void;
  /** The colours in the frame on screen right now, for the picker to offer. */
  sampleColors?: () => string[];
}) {
  const plain = style.background.kind === "none";
  const aspect = aspectById(style.aspect);
  const cropped = !isFullCrop(crop);

  const [editing, setEditing] = useState(false);
  const [loadingPicture, setLoadingPicture] = useState(false);
  const [sampled, setSampled] = useState<string[]>([]);
  // Held as the narrowed value, not a flag: the src is needed a few lines on.
  const picture =
    style.background.kind === "image" ? style.background : null;
  const preset = presetOf(style.background);
  // A background that matches none of the presets is one the user built.
  const custom = !plain && !preset && !picture;

  const setBackground = (background: Background) =>
    onChange({ ...style, background });

  const openEditor = () => {
    // A picture isn't made of colours, so the colour editor starts from one.
    // Sampled when the panel opens rather than continuously: these are the
    // colours of the frame you're looking at, which is the useful moment.
    setSampled(sampleColors?.() ?? []);
    if (plain || picture) setBackground(FIRST_CUSTOM);
    setEditing(true);
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface/60 p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
          Frame
        </span>

        <button
          type="button"
          title="None"
          aria-label="Background: none"
          aria-pressed={plain}
          onClick={() => {
            setBackground(NO_BACKGROUND);
            setEditing(false);
          }}
          className={cn(
            "grid size-7 place-items-center rounded-md border transition-shadow",
            plain
              ? "border-red ring-2 ring-red/40"
              : "border-border hover:border-foreground/40",
          )}
        >
          <Ban className="size-3.5 text-muted-foreground" />
        </button>

        {BACKGROUND_PRESETS.map((bg) => {
          const active = sameBackground(style.background, bg.value);
          return (
            <button
              key={bg.id}
              type="button"
              title={bg.label}
              aria-label={`Background: ${bg.label}`}
              aria-pressed={active}
              onClick={() => setBackground(bg.value)}
              className={cn(
                "size-7 rounded-md border transition-shadow",
                active
                  ? "border-red ring-2 ring-red/40"
                  : "border-border hover:border-foreground/40",
              )}
              style={{ background: backgroundCss(bg.value) }}
            />
          );
        })}

        <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />

        <button
          type="button"
          aria-label="Make your own background"
          // Two things at once, said separately: pressed is what's in force —
          // the same question the preset swatches answer — and expanded is
          // whether the controls for it are showing.
          aria-pressed={custom}
          aria-expanded={editing}
          title={plain ? "Make your own background" : "Change these colours"}
          onClick={() => (editing ? setEditing(false) : openEditor())}
          className={cn(
            "grid size-7 place-items-center rounded-md border transition-shadow",
            editing || custom
              ? "border-red ring-2 ring-red/40"
              : "border-border hover:border-foreground/40",
          )}
          style={custom ? { background: backgroundCss(style.background) } : undefined}
        >
          {!custom && <Pipette className="size-3.5 text-muted-foreground" />}
        </button>

        <label
          title="Use a picture"
          className={cn(
            "grid size-7 cursor-pointer place-items-center rounded-md border bg-cover bg-center transition-shadow",
            picture
              ? "border-red ring-2 ring-red/40"
              : "border-border hover:border-foreground/40",
          )}
          style={
            picture ? { backgroundImage: `url("${picture.src}")` } : undefined
          }
        >
          {!picture && <ImageIcon className="size-3.5 text-muted-foreground" />}
          <span className="sr-only">Use a picture as the background</span>
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              // Cleared straight away, so choosing the same file twice in a
              // row still fires a change.
              event.target.value = "";
              if (!file) return;
              setLoadingPicture(true);
              try {
                const src = await prepareBackgroundPicture(file);
                setBackground({ kind: "image", src });
                setEditing(false);
              } catch (error) {
                toast.error(
                  error instanceof Error
                    ? error.message
                    : "That picture couldn't be used.",
                );
              } finally {
                setLoadingPicture(false);
              }
            }}
          />
        </label>

        <span className="ml-1 font-mono text-[11px] text-muted-foreground/70">
          {loadingPicture
            ? "reading the picture…"
            : editing
              ? "any colour — add a second for a gradient"
              : picture
                ? "your picture"
                : custom
                  ? "your own"
                  : (preset?.label.toLowerCase() ?? "")}
        </span>
      </div>

      {loadingPicture && (
        <span className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          shrinking it to something the edit can carry
        </span>
      )}

      {editing && (
        <BackgroundEditor
          value={style.background}
          onChange={setBackground}
          suggestions={sampled}
        />
      )}

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
