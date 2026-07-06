"use client";

import { useCallback, useEffect, useState } from "react";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { useScreenRecorder, type Recording } from "@/lib/use-screen-recorder";
import { useMediaSupport } from "@/lib/use-media-support";
import { useRecentRecordings } from "@/lib/use-recent-recordings";
import { getRecordingBlob } from "@/lib/recordings-store";
import { captureCover } from "@/lib/capture-cover";
import { Wordmark } from "@/components/wordmark";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { IdleControls } from "@/components/recorder/idle-controls";
import { useRecorderSettings } from "@/components/recorder/recorder-settings";
import { RecentRecordingsDialog } from "@/components/recorder/recent-recordings";
import { RecordingHud } from "@/components/recorder/recording-hud";
import { Editor } from "@/components/recorder/editor";
import { Countdown } from "@/components/recorder/countdown";
import { Unsupported } from "@/components/recorder/unsupported";

function fileExt(mimeType: string): string {
  return mimeType.includes("mp4") ? "mp4" : "webm";
}

export function RecorderShell() {
  const support = useMediaSupport();
  const recorder = useScreenRecorder();
  const [micEnabled, setMicEnabled] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [settings, patchSettings] = useRecorderSettings();
  const { items: recents, save, remove } = useRecentRecordings();
  const [viewing, setViewing] = useState<Recording | null>(null);

  const {
    status,
    error,
    elapsedMs,
    recording,
    previewStream,
    countdown,
    micActive,
    micMuted,
    toggleMicMuted,
    start,
    stop,
    reset,
  } = recorder;

  const blocked = support.checked && !support.supported;

  // Persist each finished recording to the local (IndexedDB) history, with a
  // captured cover frame.
  useEffect(() => {
    if (!recording) return;
    let cancelled = false;
    captureCover(recording.url).then((cover) => {
      if (cancelled) return;
      save({
        blob: recording.blob,
        mimeType: recording.mimeType,
        size: recording.size,
        durationMs: recording.durationMs,
        cover,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [recording, save]);

  const openRecent = useCallback(
    async (id: string) => {
      const blob = await getRecordingBlob(id);
      if (!blob) return;
      const meta = recents.find((r) => r.id === id);
      setViewing({
        url: URL.createObjectURL(blob),
        blob,
        mimeType: meta?.mimeType ?? blob.type,
        size: blob.size,
        durationMs: meta?.durationMs ?? 0,
      });
    },
    [recents],
  );

  const closeViewing = useCallback(() => {
    setViewing((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return null;
    });
  }, []);

  const downloadRecent = useCallback(
    async (id: string) => {
      const blob = await getRecordingBlob(id);
      if (!blob) return;
      const meta = recents.find((r) => r.id === id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `kirmizi-recording.${fileExt(meta?.mimeType ?? blob.type)}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    },
    [recents],
  );

  const startRecording = useCallback(
    () =>
      start({
        mic: micEnabled,
        camera: cameraEnabled,
        cameraDeviceId: settings.camDeviceId,
        resolution: settings.resolution,
        fps: settings.fps,
        quality: settings.quality,
        countdown: settings.countdown,
        cameraLayout: {
          x: settings.camX,
          y: settings.camY,
          size: settings.camSize,
          shape: settings.camShape,
          mirror: settings.camMirror,
          borderColor: settings.camBorderColor,
          borderWidth: settings.camBorderWidth,
        },
      }),
    [start, micEnabled, cameraEnabled, settings],
  );

  // Keyboard shortcuts: R to record, S to stop, Esc to cancel the countdown.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (blocked || viewing) return;
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
  }, [blocked, viewing, status, startRecording, stop, reset]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-6 py-5">
        <Wordmark />
        <ThemeToggle />
      </header>

      <main
        id="main-content"
        className="grid flex-1 place-items-center px-6 pb-16"
      >
        {blocked ? (
          <Unsupported support={support} />
        ) : viewing ? (
          <Editor recording={viewing} onReset={closeViewing} />
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
            previewStream={previewStream}
          />
        ) : status === "stopped" && recording ? (
          <Editor recording={recording} onReset={reset} />
        ) : (
          <div className="flex w-full flex-col items-center gap-8">
            <IdleControls
              onStart={startRecording}
              acquiring={status === "acquiring"}
              micEnabled={micEnabled}
              onMicChange={setMicEnabled}
              cameraEnabled={cameraEnabled}
              onCameraChange={setCameraEnabled}
              settings={settings}
              onSettingsChange={patchSettings}
            />
            <RecentRecordingsDialog
              items={recents}
              onOpen={openRecent}
              onDownload={downloadRecent}
              onDelete={remove}
            />
          </div>
        )}
      </main>

      {status === "countdown" && <Countdown value={countdown} />}
    </div>
  );
}
