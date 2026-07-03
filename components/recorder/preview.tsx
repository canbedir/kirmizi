"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Loader2, RotateCcw, Scissors } from "lucide-react";
import { toast } from "sonner";
import type { Recording } from "@/lib/use-screen-recorder";
import { formatBytes, formatDuration } from "@/lib/format";
import { canTrimVideo, trimVideo } from "@/lib/trim-video";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

function fileExtension(mimeType: string): string {
  return mimeType.includes("mp4") ? "mp4" : "webm";
}

function downloadName(mimeType: string, trimmed: boolean): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(
    now.getDate(),
  )}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  const suffix = trimmed ? "-clip" : "";
  return `kirmizi-${stamp}${suffix}.${fileExtension(mimeType)}`;
}

function saveUrl(url: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export function Preview({
  recording,
  onReset,
}: {
  recording: Recording;
  onReset: () => void;
}) {
  const format = fileExtension(recording.mimeType).toUpperCase();
  const videoRef = useRef<HTMLVideoElement>(null);

  const fallbackDuration = Math.max(0.1, recording.durationMs / 1000);
  const [duration, setDuration] = useState(fallbackDuration);
  const [range, setRange] = useState<[number, number]>([0, fallbackDuration]);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const measuredRef = useRef(false);

  const [start, end] = range;
  const trimmed = start > 0.1 || end < duration - 0.1;

  // MediaRecorder's webm often reports duration = Infinity until you seek to the
  // end — force it, read the real duration, then rewind.
  function applyDuration(value: number) {
    if (measuredRef.current || !Number.isFinite(value) || value <= 0) return;
    measuredRef.current = true;
    setDuration(value);
    setRange([0, value]);
  }

  function handleLoadedMetadata() {
    const video = videoRef.current;
    if (!video) return;
    if (!Number.isFinite(video.duration)) {
      video.currentTime = 1e101;
    } else {
      applyDuration(video.duration);
    }
  }

  function handleDurationChange() {
    const video = videoRef.current;
    if (!video || measuredRef.current) return;
    if (Number.isFinite(video.duration)) {
      applyDuration(video.duration);
      video.currentTime = 0;
    }
  }

  // Keep playback inside the selected range: rewind to the in-point at the out.
  function handleTimeUpdate() {
    const video = videoRef.current;
    if (!video || !measuredRef.current || video.paused) return;
    if (video.currentTime >= end - 0.02) {
      video.pause();
      video.currentTime = start;
    }
  }

  function handleRangeChange(value: number | readonly number[]) {
    const arr = Array.isArray(value) ? value : [value, value];
    const next: [number, number] = [arr[0], arr[1]];
    const video = videoRef.current;
    if (video) {
      // Scrub to whichever handle the user moved.
      if (next[0] !== start) video.currentTime = next[0];
      else if (next[1] !== end) video.currentTime = next[1];
    }
    setRange(next);
  }

  // Space toggles play/pause on the preview, unless a control is focused.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.code !== "Space") return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "BUTTON" ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      const video = videoRef.current;
      if (!video) return;
      event.preventDefault();
      if (video.paused) {
        if (video.currentTime < start || video.currentTime >= end - 0.02) {
          video.currentTime = start;
        }
        video.play().catch(() => {});
      } else {
        video.pause();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [start, end]);

  async function handleDownload() {
    const filename = downloadName(recording.mimeType, trimmed);

    if (!trimmed) {
      saveUrl(recording.url, filename);
      toast.success("Saved to your device", { description: filename });
      return;
    }

    if (!canTrimVideo()) {
      saveUrl(recording.url, downloadName(recording.mimeType, false));
      toast.error("This browser can't trim — saved the full recording instead.");
      return;
    }

    setExporting(true);
    setProgress(0);
    try {
      const blob = await trimVideo(
        recording.url,
        start,
        end,
        recording.mimeType,
        setProgress,
      );
      const url = URL.createObjectURL(blob);
      saveUrl(url, filename);
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast.success("Trimmed clip saved", { description: filename });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn't export the clip.",
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex w-full max-w-3xl flex-col gap-6">
      <video
        ref={videoRef}
        key={recording.url}
        src={recording.url}
        controls
        playsInline
        onLoadedMetadata={handleLoadedMetadata}
        onDurationChange={handleDurationChange}
        onTimeUpdate={handleTimeUpdate}
        className="w-full rounded-xl border border-border bg-black shadow-[0_30px_90px_-40px_rgba(0,0,0,0.6)]"
      />

      {/* Trim editor */}
      <div className="space-y-2.5">
        <Slider
          min={0}
          max={duration}
          step={0.05}
          value={range}
          onValueChange={handleRangeChange}
          disabled={exporting}
          aria-label="Trim range"
        />
        <div className="flex items-center justify-between font-mono text-xs text-muted-foreground">
          <span>In {formatDuration(start * 1000)}</span>
          <span className="inline-flex items-center gap-1.5 text-foreground">
            <Scissors className="size-3.5" />
            {formatDuration((end - start) * 1000)}
            {trimmed && <span className="text-muted-foreground">selected</span>}
          </span>
          <span>Out {formatDuration(end * 1000)}</span>
        </div>
      </div>

      <div className="flex flex-col-reverse items-center gap-4 sm:flex-row sm:justify-between">
        <p className="flex items-center gap-2 font-mono text-sm text-muted-foreground">
          <span className="rounded border border-border px-1.5 py-0.5 text-xs text-foreground">
            {format}
          </span>
          {formatBytes(recording.size)}
          <span aria-hidden>·</span>
          <span className="text-muted-foreground/60">
            <kbd className="rounded border border-border px-1 py-0.5 text-xs">
              Space
            </kbd>{" "}
            to play
          </span>
        </p>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={onReset}
            disabled={exporting}
            className="gap-2"
          >
            <RotateCcw className="size-4" />
            Record again
          </Button>
          <Button
            onClick={handleDownload}
            disabled={exporting}
            className="gap-2 bg-red text-red-foreground hover:bg-red-hover"
          >
            {exporting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Exporting {Math.round(progress * 100)}%
              </>
            ) : (
              <>
                <Download className="size-4" />
                {trimmed ? "Download clip" : "Download"}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
