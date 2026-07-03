"use client";

import { useEffect, useRef } from "react";
import { Download, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import type { Recording } from "@/lib/use-screen-recorder";
import { formatBytes, formatDuration } from "@/lib/format";
import { Button } from "@/components/ui/button";

function fileExtension(mimeType: string): string {
  return mimeType.includes("mp4") ? "mp4" : "webm";
}

function downloadName(mimeType: string): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(
    now.getDate(),
  )}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `kirmizi-${stamp}.${fileExtension(mimeType)}`;
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
      if (video.paused) video.play().catch(() => {});
      else video.pause();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function handleDownload() {
    const filename = downloadName(recording.mimeType);
    const anchor = document.createElement("a");
    anchor.href = recording.url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    toast.success("Saved to your device", { description: filename });
  }

  return (
    <div className="flex w-full max-w-3xl flex-col gap-6">
      <video
        ref={videoRef}
        key={recording.url}
        src={recording.url}
        controls
        playsInline
        className="w-full rounded-xl border border-border bg-black shadow-[0_30px_90px_-40px_rgba(0,0,0,0.6)]"
      />

      <div className="flex flex-col-reverse items-center gap-4 sm:flex-row sm:justify-between">
        <p className="flex items-center gap-2 font-mono text-sm text-muted-foreground">
          <span className="rounded border border-border px-1.5 py-0.5 text-xs text-foreground">
            {format}
          </span>
          {formatDuration(recording.durationMs)}
          <span aria-hidden>·</span>
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
          <Button variant="outline" onClick={onReset} className="gap-2">
            <RotateCcw className="size-4" />
            Record again
          </Button>
          <Button
            onClick={handleDownload}
            className="gap-2 bg-red text-red-foreground hover:bg-red-hover"
          >
            <Download className="size-4" />
            Download
          </Button>
        </div>
      </div>
    </div>
  );
}
