"use client";

import { Mic, MicOff, Square } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/format";
import { Button } from "@/components/ui/button";

interface RecordingHudProps {
  elapsedMs: number;
  onStop: () => void;
  micActive: boolean;
  micMuted: boolean;
  onToggleMic: () => void;
}

export function RecordingHud({
  elapsedMs,
  onStop,
  micActive,
  micMuted,
  onToggleMic,
}: RecordingHudProps) {
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

      <div className="flex items-center gap-3">
        {micActive && (
          <Button
            variant="outline"
            size="lg"
            onClick={onToggleMic}
            aria-pressed={micMuted}
            className={cn(
              "h-12 gap-2 rounded-full px-5 text-base",
              micMuted && "border-red/30 bg-red/10 text-red",
            )}
          >
            {micMuted ? (
              <MicOff className="size-4" />
            ) : (
              <Mic className="size-4" />
            )}
            {micMuted ? "Mic muted" : "Mic on"}
          </Button>
        )}

        <Button
          onClick={onStop}
          size="lg"
          className="h-12 gap-2 rounded-full bg-red px-7 text-base text-red-foreground hover:bg-red-hover"
        >
          <Square className="size-4 fill-current" />
          Stop recording
        </Button>
      </div>

      <p className="font-mono text-xs text-muted-foreground/70">
        Press <kbd className="rounded border border-border px-1.5 py-0.5">S</kbd>{" "}
        to stop
      </p>
    </div>
  );
}
