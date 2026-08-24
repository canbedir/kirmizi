"use client";

import { useRef, useState } from "react";
import { ArrowUpRight, Pipette, Square, Trash2, Type } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  ANNOTATION_MAX_SIZE,
  ANNOTATION_MIN_SIZE,
  type Annotation,
  type AnnotationKind,
} from "@/lib/annotate";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ColorPicker } from "@/components/ui/color-picker";

// Adding and changing the marks drawn over the recording. Everything about
// *where* a mark goes is done on the stage itself and everything about *when*
// on the timeline, so what's left here is what it's made of.

const KINDS: { kind: AnnotationKind; label: string; icon: typeof Type }[] = [
  { kind: "text", label: "Text", icon: Type },
  { kind: "arrow", label: "Arrow", icon: ArrowUpRight },
  { kind: "box", label: "Box", icon: Square },
];

/** Marker colours: strong, and legible against a screenshot of anything. */
const SWATCHES = [
  "#f62d22",
  "#f8b500",
  "#22c55e",
  "#3b82f6",
  "#ffffff",
  "#111111",
];

function sliderValue(value: number | readonly number[]): number {
  return Array.isArray(value) ? (value[0] as number) : (value as number);
}

export function AnnotatePanel({
  annotations,
  selected,
  onAdd,
  onSelect,
  onRemove,
  onChange,
  onCheckpoint,
}: {
  annotations: Annotation[];
  selected: Annotation | null;
  onAdd: (kind: AnnotationKind) => void;
  onSelect: (id: string | null) => void;
  onRemove: (id: string) => void;
  onChange: (id: string, patch: Partial<Omit<Annotation, "id" | "kind">>) => void;
  /** Marks the start of a gesture, so a whole drag undoes in one step. */
  onCheckpoint: () => void;
}) {
  const [picking, setPicking] = useState(false);
  // A drag of the slider, or a sentence typed into the box, is one edit —
  // the checkpoint is taken on the first change and not again until it ends.
  const dirty = useRef(false);
  const beginEdit = () => {
    if (dirty.current) return;
    dirty.current = true;
    onCheckpoint();
  };
  const endEdit = () => {
    dirty.current = false;
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
          Marks
        </span>
        {KINDS.map(({ kind, label, icon: Icon }) => (
          <Button
            key={kind}
            size="sm"
            variant="outline"
            onClick={() => onAdd(kind)}
            className="gap-1.5"
            title={`Add ${label.toLowerCase()} at the playhead`}
          >
            <Icon className="size-3.5" />
            {label}
          </Button>
        ))}

        {annotations.length > 0 && (
          <div className="ml-1 flex flex-wrap items-center gap-1">
            {annotations.map((a) => {
              const Icon = KINDS.find((k) => k.kind === a.kind)!.icon;
              const active = a.id === selected?.id;
              return (
                <button
                  key={a.id}
                  type="button"
                  aria-label={`Mark: ${a.kind}${a.text ? ` — ${a.text.split("\n")[0]}` : ""}`}
                  aria-pressed={active}
                  onClick={() => onSelect(active ? null : a.id)}
                  className={cn(
                    "grid size-7 place-items-center rounded-md border transition-colors",
                    active
                      ? "border-red text-red"
                      : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground",
                  )}
                >
                  <Icon className="size-3.5" />
                </button>
              );
            })}
          </div>
        )}

        <span className="ml-auto font-mono text-[11px] text-muted-foreground/80">
          {selected
            ? "drag it on the video, drag its pill to re-time it"
            : annotations.length
              ? "click a mark to change it"
              : "they appear at the playhead"}
        </span>
      </div>

      {selected && (
        <div className="flex flex-col gap-3 rounded-md border border-border bg-background/40 p-3">
          {selected.kind === "text" && (
            <textarea
              value={selected.text}
              rows={2}
              spellCheck={false}
              aria-label="What the mark says"
              placeholder="Say something"
              // Typing is one continuous edit; the checkpoint is taken on the
              // first keystroke so Ctrl+Z undoes the sentence, not the letter.
              onChange={(e) => {
                beginEdit();
                onChange(selected.id, { text: e.target.value });
              }}
              onBlur={endEdit}
              className="w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus-visible:border-red"
            />
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex items-center gap-1.5">
              {SWATCHES.map((color) => (
                <button
                  key={color}
                  type="button"
                  title={color}
                  aria-label={`Colour: ${color}`}
                  aria-pressed={selected.color.toLowerCase() === color}
                  onClick={() => {
                    onCheckpoint();
                    onChange(selected.id, { color });
                  }}
                  className={cn(
                    "size-6 rounded-md border transition-shadow",
                    selected.color.toLowerCase() === color
                      ? "border-red ring-2 ring-red/40"
                      : "border-border hover:border-foreground/40",
                  )}
                  style={{ background: color }}
                />
              ))}
              <button
                type="button"
                aria-label="Any other colour"
                aria-pressed={picking}
                onClick={() => setPicking((on) => !on)}
                className={cn(
                  "grid size-6 place-items-center rounded-md border transition-shadow",
                  picking
                    ? "border-red ring-2 ring-red/40"
                    : "border-border hover:border-foreground/40",
                )}
              >
                <Pipette className="size-3 text-muted-foreground" />
              </button>
            </div>

            <label className="flex min-w-40 flex-1 items-center gap-2">
              <span className="font-mono text-[11px] text-muted-foreground">
                size
              </span>
              <Slider
                value={[selected.size]}
                min={ANNOTATION_MIN_SIZE}
                max={ANNOTATION_MAX_SIZE}
                step={0.002}
                onValueChange={(v) => {
                  beginEdit();
                  onChange(selected.id, { size: sliderValue(v) });
                }}
                onValueCommitted={endEdit}
              />
            </label>

            <Button
              size="sm"
              variant="ghost"
              onClick={() => onRemove(selected.id)}
              className="gap-1.5 text-muted-foreground hover:text-red"
            >
              <Trash2 className="size-3.5" />
              Delete
            </Button>
          </div>

          {picking && (
            <ColorPicker
              value={selected.color}
              onChange={(color) => {
                beginEdit();
                onChange(selected.id, { color });
              }}
              className="w-full"
            />
          )}
        </div>
      )}
    </div>
  );
}
