"use client";

import { useCallback, useEffect, useState } from "react";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { useScreenRecorder } from "@/lib/use-screen-recorder";
import { useMediaSupport } from "@/lib/use-media-support";
import { Wordmark } from "@/components/wordmark";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { IdleControls } from "@/components/recorder/idle-controls";
import { RecordingHud } from "@/components/recorder/recording-hud";
import { Editor } from "@/components/recorder/editor";
import { Countdown } from "@/components/recorder/countdown";
import { Unsupported } from "@/components/recorder/unsupported";

export function RecorderShell() {
  const support = useMediaSupport();
  const recorder = useScreenRecorder();
  const [micEnabled, setMicEnabled] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);

  const {
    status,
    error,
    elapsedMs,
    recording,
    countdown,
    micActive,
    micMuted,
    toggleMicMuted,
    start,
    stop,
    reset,
  } = recorder;

  const blocked = support.checked && !support.supported;

  const startRecording = useCallback(
    () => start({ mic: micEnabled, camera: cameraEnabled }),
    [start, micEnabled, cameraEnabled],
  );

  // Keyboard shortcuts: R to record, S to stop, Esc to cancel the countdown.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (blocked) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      const key = event.key.toLowerCase();
      if (status === "idle" && key === "r") {
        event.preventDefault();
        startRecording();
      } else if (status === "recording" && key === "s") {
        event.preventDefault();
        stop();
      } else if (status === "countdown" && event.key === "Escape") {
        event.preventDefault();
        reset();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [blocked, status, startRecording, stop, reset]);

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
              <h1 className="font-bold text-3xl">Something interrupted that</h1>
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
          <RecordingHud
            elapsedMs={elapsedMs}
            onStop={stop}
            micActive={micActive}
            micMuted={micMuted}
            onToggleMic={toggleMicMuted}
          />
        ) : status === "stopped" && recording ? (
          <Editor recording={recording} onReset={reset} />
        ) : (
          <IdleControls
            onStart={startRecording}
            acquiring={status === "acquiring"}
            micEnabled={micEnabled}
            onMicChange={setMicEnabled}
            cameraEnabled={cameraEnabled}
            onCameraChange={setCameraEnabled}
          />
        )}
      </main>

      {status === "countdown" && <Countdown value={countdown} />}
    </div>
  );
}
