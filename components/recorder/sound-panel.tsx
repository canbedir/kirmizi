"use client";

import { AudioLines, Waves } from "lucide-react";
import { cn } from "@/lib/cn";
import { TARGET_LUFS } from "@/lib/loudness";
import type { SoundStyle } from "@/lib/sound";
import type { AudioAnalysisState } from "@/lib/use-audio-analysis";
import { Button } from "@/components/ui/button";

// The measurement is shown rather than hidden: "-28.4 → -16.0 LUFS" says what
// was wrong and what was done about it, which is more use than a slider and
// a guess.

const lufs = (value: number) => `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(1)}`;

export function SoundPanel({
  style,
  state,
  onChange,
}: {
  style: SoundStyle;
  state: AudioAnalysisState;
  onChange: (style: SoundStyle) => void;
}) {
  const analysis = state.analysis;

  const readout =
    state.status === "measuring"
      ? "measuring…"
      : state.status === "silent"
        ? "no sound recorded"
        : style.normalise
          ? `${lufs(analysis!.report.integrated)} → ${lufs(analysis!.reached)} LUFS`
          : `${lufs(analysis!.report.integrated)} LUFS`;

  const note =
    state.status === "ready" && style.normalise && analysis!.peakLimited
      ? `Held back at ${lufs(analysis!.reached)} LUFS: any louder and the loudest moment would clip.`
      : null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
          Sound
        </span>

        <Button
          size="sm"
          variant="outline"
          onClick={() => onChange({ ...style, normalise: !style.normalise })}
          aria-pressed={style.normalise}
          disabled={state.status !== "ready"}
          className={cn("gap-1.5", style.normalise && "border-red text-red")}
          title={`Bring the clip to ${TARGET_LUFS} LUFS, the level most players expect`}
        >
          <AudioLines className="size-3.5" />
          Level
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={() => onChange({ ...style, rumble: !style.rumble })}
          aria-pressed={style.rumble}
          disabled={state.status !== "ready"}
          className={cn("gap-1.5", style.rumble && "border-red text-red")}
          title="Cut everything below 80 Hz — desk thumps and room rumble, not voice"
        >
          <Waves className="size-3.5" />
          Rumble
        </Button>

        <span className="ml-auto font-mono text-[11px] text-muted-foreground tabular-nums">
          {readout}
        </span>
      </div>

      {note && (
        <p className="font-mono text-[11px] leading-relaxed text-muted-foreground/80">
          {note}
        </p>
      )}
    </div>
  );
}
