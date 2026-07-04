"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  Loader2,
  Pause,
  Play,
  Redo2,
  RotateCcw,
  Scissors,
  Trash2,
  Undo2,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";
import type { Recording } from "@/lib/use-screen-recorder";
import { formatBytes, formatDuration } from "@/lib/format";
import { SPEED_STEPS, useVideoEditor, type Segment } from "@/lib/use-video-editor";
import { canExportVideo, exportSegments } from "@/lib/export-segments";
import { generateThumbnails } from "@/lib/thumbnails";
import { Button } from "@/components/ui/button";
import { Timeline } from "@/components/recorder/timeline";

const THUMB_COUNT = 14;

function fileExtension(mimeType: string): string {
  return mimeType.includes("mp4") ? "mp4" : "webm";
}

function downloadName(mimeType: string, edited: boolean): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(
    now.getDate(),
  )}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `kirmizi-${stamp}${edited ? "-clip" : ""}.${fileExtension(mimeType)}`;
}

function saveUrl(url: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export function Editor({
  recording,
  onReset,
}: {
  recording: Recording;
  onReset: () => void;
}) {
  const editor = useVideoEditor();
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const measuredRef = useRef(false);

  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const playingRef = useRef(false);
  const [containerWidth, setContainerWidth] = useState(0);
  const [zoomFactor, setZoomFactor] = useState(1);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const exportSupported = useMemo(() => canExportVideo(), []);

  const { duration, segments, selectedId, isEdited, canUndo, canRedo } = editor;
  // At zoomFactor 1 the whole clip fits the timeline width; zoom scales up.
  const fitPxPerSec = duration > 0 && containerWidth > 0 ? containerWidth / duration : 10;
  const pxPerSec = fitPxPerSec * zoomFactor;

  // Track the available timeline width so the default view fits the clip.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setContainerWidth(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const selected = segments.find((s) => s.id === selectedId) ?? null;
  const format = fileExtension(recording.mimeType).toUpperCase();
  const canSplit = segments.some(
    (s) => playhead > s.start + 0.15 && playhead < s.end - 0.15,
  );

  const setPlayingBoth = useCallback((value: boolean) => {
    playingRef.current = value;
    setPlaying(value);
  }, []);

  const applySegment = (video: HTMLVideoElement, seg: Segment) => {
    video.muted = seg.muted;
    video.playbackRate = seg.speed;
  };

  // --- duration measurement (webm often reports Infinity until sought) ---
  function finalizeDuration(value: number) {
    if (measuredRef.current || !Number.isFinite(value) || value <= 0) return;
    measuredRef.current = true;
    editor.init(value);
    setZoomFactor(1);
    const video = videoRef.current;
    if (video) video.currentTime = 0;
    setPlayhead(0);
    generateThumbnails(recording.url, value, THUMB_COUNT)
      .then(setThumbnails)
      .catch(() => {});
  }

  function handleLoadedMetadata() {
    const video = videoRef.current;
    if (!video) return;
    if (!Number.isFinite(video.duration)) video.currentTime = 1e101;
    else finalizeDuration(video.duration);
  }

  function handleDurationChange() {
    const video = videoRef.current;
    if (!video || measuredRef.current) return;
    if (Number.isFinite(video.duration)) finalizeDuration(video.duration);
  }

  // --- edited playback: skip gaps, apply per-segment mute + speed ---
  function handleTimeUpdate() {
    const video = videoRef.current;
    if (!video) return;
    const t = Math.min(video.currentTime, editor.duration);
    setPlayhead(t);
    if (!playingRef.current) return;

    const segs = editor.segments;
    if (!segs.length) return;
    const stopAtEnd = () => {
      const end = segs[segs.length - 1].end;
      video.pause();
      video.currentTime = end;
      setPlayhead(end);
      setPlayingBoth(false);
    };
    const idx = segs.findIndex((s) => t >= s.start - 0.02 && t < s.end - 0.02);
    if (idx === -1) {
      const next = segs.find((s) => s.start >= t - 0.02);
      if (next) {
        video.currentTime = next.start;
        applySegment(video, next);
      } else {
        stopAtEnd();
      }
      return;
    }
    if (t >= segs[idx].end - 0.05) {
      const next = segs[idx + 1];
      if (next) {
        video.currentTime = next.start;
        applySegment(video, next);
      } else {
        stopAtEnd();
      }
    }
  }

  const play = useCallback(() => {
    const video = videoRef.current;
    const segs = editor.segments;
    if (!video || !segs.length) return;
    let t = playhead;
    const last = segs[segs.length - 1];
    if (t >= last.end - 0.05) t = segs[0].start;
    let seg = segs.find((s) => t >= s.start - 0.02 && t < s.end - 0.02);
    if (!seg) {
      seg = segs.find((s) => s.start >= t - 0.02) ?? segs[0];
      t = seg.start;
    }
    video.currentTime = t;
    applySegment(video, seg);
    setPlayingBoth(true);
    video.play().catch(() => setPlayingBoth(false));
  }, [editor.segments, playhead, setPlayingBoth]);

  const pause = useCallback(() => {
    videoRef.current?.pause();
    setPlayingBoth(false);
  }, [setPlayingBoth]);

  const togglePlay = useCallback(() => {
    if (playingRef.current) pause();
    else play();
  }, [play, pause]);

  function handleSeek(time: number) {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = time;
    setPlayhead(time);
    const seg = editor.segments.find((s) => time >= s.start && time < s.end);
    if (seg) applySegment(video, seg);
  }

  const zoomIn = useCallback(
    () => setZoomFactor((z) => Math.min(12, z * 1.6)),
    [],
  );
  const zoomOut = useCallback(
    () => setZoomFactor((z) => Math.max(1, z / 1.6)),
    [],
  );

  // --- keyboard shortcuts (stable listener via an actions ref) ---
  const actionsRef = useRef({
    togglePlay,
    split: () => editor.split(playhead),
    removeSelected: () => selectedId && editor.remove(selectedId),
    toggleMute: () => selected && editor.setMuted(selected.id, !selected.muted),
    zoomIn,
    zoomOut,
    undo: editor.undo,
    redo: editor.redo,
  });
  useEffect(() => {
    actionsRef.current = {
      togglePlay,
      split: () => editor.split(playhead),
      removeSelected: () => selectedId && editor.remove(selectedId),
      toggleMute: () =>
        selected && editor.setMuted(selected.id, !selected.muted),
      zoomIn,
      zoomOut,
      undo: editor.undo,
      redo: editor.redo,
    };
  });

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      const a = actionsRef.current;

      // Undo / redo (Ctrl+Z, Ctrl+Shift+Z / Ctrl+Y; Cmd on macOS).
      if (event.ctrlKey || event.metaKey) {
        const key = event.key.toLowerCase();
        if (key === "z") {
          event.preventDefault();
          if (event.shiftKey) a.redo();
          else a.undo();
        } else if (key === "y") {
          event.preventDefault();
          a.redo();
        }
        return; // leave other Ctrl/Cmd combos (save, etc.) alone
      }

      switch (event.key) {
        case " ":
          event.preventDefault();
          a.togglePlay();
          break;
        case "s":
        case "S":
          a.split();
          break;
        case "Delete":
        case "Backspace":
          a.removeSelected();
          break;
        case "m":
        case "M":
          a.toggleMute();
          break;
        case "+":
        case "=":
          a.zoomIn();
          break;
        case "-":
        case "_":
          a.zoomOut();
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function handleExport() {
    if (!isEdited) {
      saveUrl(recording.url, downloadName(recording.mimeType, false));
      toast.success("Saved to your device");
      return;
    }
    if (!canExportVideo()) {
      saveUrl(recording.url, downloadName(recording.mimeType, false));
      toast.error("This browser can't export edits — saved the full recording.");
      return;
    }
    pause();
    setExporting(true);
    setProgress(0);
    try {
      const blob = await exportSegments(
        recording.url,
        editor.segments,
        recording.mimeType,
        setProgress,
      );
      const url = URL.createObjectURL(blob);
      const filename = downloadName(recording.mimeType, true);
      saveUrl(url, filename);
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast.success("Edited clip saved", { description: filename });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn't export the clip.",
      );
    } finally {
      setExporting(false);
    }
  }

  const ready = duration > 0;

  return (
    <div ref={containerRef} className="flex w-full max-w-3xl flex-col gap-5">
      <div className="relative">
        <video
          ref={videoRef}
          key={recording.url}
          src={recording.url}
          playsInline
          onLoadedMetadata={handleLoadedMetadata}
          onDurationChange={handleDurationChange}
          onTimeUpdate={handleTimeUpdate}
          onEnded={() => {
            setPlayingBoth(false);
            if (measuredRef.current) setPlayhead(editor.duration);
          }}
          onClick={togglePlay}
          className="w-full cursor-pointer rounded-xl border border-border bg-black shadow-[0_30px_90px_-40px_rgba(0,0,0,0.6)]"
        />
        {!ready && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center rounded-xl bg-background/40">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      {ready && (
        <>
          {/* Transport + zoom */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant="outline"
                onClick={togglePlay}
                aria-label={playing ? "Pause" : "Play"}
              >
                {playing ? (
                  <Pause className="size-4" />
                ) : (
                  <Play className="size-4" />
                )}
              </Button>
              <span className="font-mono text-sm text-muted-foreground">
                {formatDuration(playhead * 1000)}
                <span className="opacity-50"> / {formatDuration(duration * 1000)}</span>
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <Button
                size="icon"
                variant="ghost"
                onClick={editor.undo}
                disabled={!canUndo}
                aria-label="Undo"
              >
                <Undo2 className="size-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={editor.redo}
                disabled={!canRedo}
                aria-label="Redo"
              >
                <Redo2 className="size-4" />
              </Button>
              <span className="mx-1 h-5 w-px bg-border" />
              <Button
                size="icon"
                variant="ghost"
                onClick={zoomOut}
                aria-label="Zoom out"
              >
                <ZoomOut className="size-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={zoomIn}
                aria-label="Zoom in"
              >
                <ZoomIn className="size-4" />
              </Button>
            </div>
          </div>

          <Timeline
            duration={duration}
            segments={segments}
            selectedId={selectedId}
            playhead={playhead}
            pxPerSec={pxPerSec}
            thumbnails={thumbnails}
            onSeek={handleSeek}
            onSelect={editor.select}
          />

          {/* Editing toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => editor.split(playhead)}
              disabled={!canSplit}
              className="gap-1.5"
            >
              <Scissors className="size-3.5" />
              Split
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => selectedId && editor.remove(selectedId)}
              disabled={!selectedId || segments.length <= 1}
              className="gap-1.5"
            >
              <Trash2 className="size-3.5" />
              Delete
            </Button>

            <span className="mx-1 h-5 w-px bg-border" />

            <Button
              size="sm"
              variant="outline"
              onClick={() => selected && editor.setMuted(selected.id, !selected.muted)}
              disabled={!selected}
              className="gap-1.5"
            >
              {selected?.muted ? (
                <VolumeX className="size-3.5" />
              ) : (
                <Volume2 className="size-3.5" />
              )}
              {selected?.muted ? "Unmute" : "Mute"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (!selected) return;
                const i = SPEED_STEPS.indexOf(
                  selected.speed as (typeof SPEED_STEPS)[number],
                );
                const nextSpeed =
                  SPEED_STEPS[(i + 1) % SPEED_STEPS.length] ?? 1;
                editor.setSpeed(selected.id, nextSpeed);
              }}
              disabled={!selected}
              className="gap-1.5 font-mono"
            >
              {selected ? `${selected.speed}×` : "1×"}
            </Button>

            <span className="ml-auto font-mono text-xs text-muted-foreground/70">
              {selected ? "segment selected" : "click the timeline to select"}
            </span>
          </div>

          {/* Actions */}
          <div className="flex flex-col-reverse items-center gap-4 border-t border-border pt-5 sm:flex-row sm:justify-between">
            <p className="flex items-center gap-2 font-mono text-sm text-muted-foreground">
              <span className="rounded border border-border px-1.5 py-0.5 text-xs text-foreground">
                {format}
              </span>
              {formatBytes(recording.size)}
              {isEdited && (
                <>
                  <span aria-hidden>·</span>
                  <span className="text-red">
                    clip {formatDuration(editor.editedDuration * 1000)}
                  </span>
                </>
              )}
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
                onClick={handleExport}
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
                    {isEdited ? "Export clip" : "Download"}
                  </>
                )}
              </Button>
            </div>
          </div>

          {!exportSupported && (
            <p className="text-center text-xs text-muted-foreground">
              Editing export isn&apos;t supported in this browser — you&apos;ll
              get the full recording. Try Chrome, Edge, or Firefox.
            </p>
          )}

          <p className="text-center font-mono text-xs text-muted-foreground/70">
            <Kbd>Space</Kbd> play · <Kbd>S</Kbd> split · <Kbd>Del</Kbd> delete ·{" "}
            <Kbd>M</Kbd> mute · <Kbd>+/–</Kbd> zoom · <Kbd>Ctrl</Kbd>+<Kbd>Z</Kbd>{" "}
            undo
          </p>
        </>
      )}
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border px-1 py-0.5">{children}</kbd>
  );
}
