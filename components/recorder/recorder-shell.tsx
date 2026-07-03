"use client";

import { useState } from "react";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { useScreenRecorder } from "@/lib/use-screen-recorder";
import { useMediaSupport } from "@/lib/use-media-support";
import { formatBytes, formatDuration } from "@/lib/format";
import { Wordmark } from "@/components/wordmark";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { IdleControls } from "@/components/recorder/idle-controls";
import { RecordingHud } from "@/components/recorder/recording-hud";
import { Unsupported } from "@/components/recorder/unsupported";

export function RecorderShell() {
  const support = useMediaSupport();
  const recorder = useScreenRecorder();
  const [micEnabled, setMicEnabled] = useState(false);

  const {
    status,
    error,
    elapsedMs,
    recording,
    start,
    stop,
    reset,
  } = recorder;

  const blocked = support.checked && !support.supported;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-6 py-5">
        <Wordmark />
        <ThemeToggle />
      </header>

      <main className="grid flex-1 place-items-center px-6 pb-16">
        {blocked ? (
          <Unsupported support={support} />
        ) : status === "error" ? (
          <div className="flex max-w-md flex-col items-center gap-6 text-center">
            <span className="grid size-16 place-items-center rounded-full border border-red/30 bg-red/10 text-red">
              <TriangleAlert className="size-7" />
            </span>
            <div className="space-y-2">
              <h1 className="font-serif text-3xl">Something interrupted that</h1>
              <p className="text-muted-foreground">
                {error ?? "The recording couldn't start."}
              </p>
            </div>
            <Button variant="outline" onClick={reset} className="gap-2">
              <RotateCcw className="size-4" />
              Try again
            </Button>
          </div>
        ) : status === "recording" ? (
          <RecordingHud elapsedMs={elapsedMs} onStop={stop} />
        ) : status === "stopped" && recording ? (
          // Minimal stopped state — the full preview + download lands next.
          <div className="flex flex-col items-center gap-6 text-center">
            <div className="space-y-1">
              <p className="font-serif text-3xl">Recording ready</p>
              <p className="font-mono text-sm text-muted-foreground">
                {formatDuration(recording.durationMs)} ·{" "}
                {formatBytes(recording.size)}
              </p>
            </div>
            <Button onClick={reset} variant="outline" className="gap-2">
              <RotateCcw className="size-4" />
              Record again
            </Button>
          </div>
        ) : (
          <IdleControls
            onStart={start}
            acquiring={status === "acquiring"}
            micEnabled={micEnabled}
            onMicChange={setMicEnabled}
          />
        )}
      </main>
    </div>
  );
}
