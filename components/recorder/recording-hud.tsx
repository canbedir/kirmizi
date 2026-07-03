"use client";

import { Square } from "lucide-react";
import { formatDuration } from "@/lib/format";
import { Button } from "@/components/ui/button";

interface RecordingHudProps {
  elapsedMs: number;
  onStop: () => void;
}

export function RecordingHud({ elapsedMs, onStop }: RecordingHudProps) {
  return (
    <div className="flex flex-col items-center gap-10 text-center">
      <div className="flex flex-col items-center gap-4">
        <span className="inline-flex items-center gap-2.5 text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">
          <span className="record-dot record-dot--live size-2.5" aria-hidden />
          Recording
        </span>
        <p
          className="font-mono text-7xl tabular-nums tracking-tight sm:text-8xl"
          aria-live="polite"
          aria-label="Elapsed time"
        >
          {formatDuration(elapsedMs)}
        </p>
      </div>

      <Button
        onClick={onStop}
        size="lg"
        className="h-12 gap-2 rounded-full bg-red px-7 text-base text-red-foreground hover:bg-red-hover"
      >
        <Square className="size-4 fill-current" />
        Stop recording
      </Button>

      <p className="font-mono text-xs text-muted-foreground">
        Long recordings grow in memory — keep an eye on the timer.
      </p>
    </div>
  );
}
