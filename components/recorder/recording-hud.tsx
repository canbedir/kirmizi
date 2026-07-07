"use client";

import { useEffect, useRef } from "react";
import { Mic, MicOff, Pause, Play, Square } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/format";
import { Button } from "@/components/ui/button";

/**
 * A label that never changes width as it toggles: the longer of the two states
 * is laid out invisibly to reserve space, and the active label is stacked on
 * top of it. Keeps the button from growing/shrinking mid-recording.
 */
function ToggleLabel({ active, options }: { active: string; options: [string, string] }) {
  const widest = options[0].length >= options[1].length ? options[0] : options[1];
  return (
    <span className="grid place-items-center">
      <span aria-hidden className="col-start-1 row-start-1 invisible">
        {widest}
      </span>
      <span className="col-start-1 row-start-1">{active}</span>
    </span>
  );
}

interface RecordingHudProps {
  elapsedMs: number;
  onStop: () => void;
  paused: boolean;
  onTogglePause: () => void;
  micActive: boolean;
  micMuted: boolean;
  onToggleMic: () => void;
  previewStream: MediaStream | null;
}

export function RecordingHud({
  elapsedMs,
  onStop,
  paused,
  onTogglePause,
  micActive,
  micMuted,
  onToggleMic,
  previewStream,
}: RecordingHudProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Attach the live capture stream to the preview element.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = previewStream;
    if (previewStream) video.play().catch(() => {});
  }, [previewStream]);

  return (
    <div className="flex w-full max-w-3xl flex-col items-center gap-6">
      <div className="relative w-full">
        {previewStream ? (
          <video
            ref={videoRef}
            muted
            autoPlay
            playsInline
            className="w-full rounded-xl border border-border bg-black shadow-[0_30px_90px_-40px_rgba(0,0,0,0.6)]"
          />
        ) : (
          <div className="grid aspect-video w-full place-items-center rounded-xl border border-border bg-black">
            <span className="font-mono text-6xl tabular-nums">
              {formatDuration(elapsedMs)}
            </span>
          </div>
        )}

        {/* Live timer badge — the dot only pulses while actually writing. */}
        <div
          className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full border border-border bg-background/70 px-3 py-1.5 backdrop-blur-md"
          aria-live="polite"
        >
          <span
            className={cn("record-dot size-2.5", !paused && "record-dot--live")}
            aria-hidden
          />
          <span className="font-mono text-sm tabular-nums">
            {formatDuration(elapsedMs)}
          </span>
          {paused && (
            <span className="font-mono text-xs uppercase tracking-[0.15em] text-muted-foreground">
              paused
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {micActive && (
          <Button
            variant="outline"
            size="lg"
            onClick={onToggleMic}
            aria-pressed={micMuted}
            aria-label={micMuted ? "Unmute microphone" : "Mute microphone"}
            title={micMuted ? "Mic muted" : "Mic on"}
            className={cn(
              "size-12 rounded-full",
              micMuted && "border-red/30 bg-red/10 text-red",
            )}
          >
            {micMuted ? (
              <MicOff className="size-4" />
            ) : (
              <Mic className="size-4" />
            )}
          </Button>
        )}

        <Button
          variant="outline"
          size="lg"
          onClick={onTogglePause}
          aria-pressed={paused}
          className={cn(
            "h-12 gap-2 rounded-full px-5 text-base",
            paused && "border-red/30 bg-red/10 text-red",
          )}
        >
          {paused ? (
            <Play className="size-4 fill-current" />
          ) : (
            <Pause className="size-4 fill-current" />
          )}
          <ToggleLabel active={paused ? "Resume" : "Pause"} options={["Resume", "Pause"]} />
        </Button>

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
        <kbd className="rounded border border-border px-1.5 py-0.5">Space</kbd>{" "}
        pause ·{" "}
        <kbd className="rounded border border-border px-1.5 py-0.5">S</kbd> stop
      </p>
    </div>
  );
}
