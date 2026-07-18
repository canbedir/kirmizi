"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  Focus,
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
import { canUseFFmpeg, losslessTrim, toCompatibleMp4 } from "@/lib/lossless-trim";
import { generateThumbnails } from "@/lib/thumbnails";
import {
  DEFAULT_FRAME_STYLE,
  ZOOM_MAX_SCALE,
  backgroundById,
  cameraGeometry,
  cropRect,
  cssZoomTransform,
  radiusPx,
  sceneActive,
  videoRect,
  zoomStateAt,
  type FrameStyle,
} from "@/lib/scene";
import {
  DEFAULT_CAMERA_LAYOUT,
  type CameraLayout,
} from "@/lib/camera-layout";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Timeline } from "@/components/recorder/timeline";
import { FramePanel } from "@/components/recorder/frame-panel";
import { CameraPanel } from "@/components/recorder/camera-panel";

const THUMB_COUNT = 14;
const FRAME_STYLE_KEY = "kirmizi:frame-style";

function loadFrameStyle(): FrameStyle {
  if (typeof window === "undefined") return DEFAULT_FRAME_STYLE;
  try {
    const raw = localStorage.getItem(FRAME_STYLE_KEY);
    if (raw) return { ...DEFAULT_FRAME_STYLE, ...JSON.parse(raw) };
  } catch {
    /* corrupted styles fall back to the default */
  }
  return DEFAULT_FRAME_STYLE;
}

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

function sliderValue(value: number | readonly number[]): number {
  return Array.isArray(value) ? (value[0] as number) : (value as number);
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
  const camRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const measuredRef = useRef(false);

  const camera = recording.camera ?? null;
  const [camLayout, setCamLayout] = useState<CameraLayout>(
    camera?.layout ?? DEFAULT_CAMERA_LAYOUT,
  );
  const [camHidden, setCamHidden] = useState(false);

  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const playingRef = useRef(false);
  const [containerWidth, setContainerWidth] = useState(0);
  const [zoomFactor, setZoomFactor] = useState(1);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const [frameStyle, setFrameStyle] = useState<FrameStyle>(loadFrameStyle);
  const [exporting, setExporting] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [progress, setProgress] = useState(0);
  const exportSupported = useMemo(() => canExportVideo(), []);

  const { duration, segments, zooms, selectedId, selectedZoomId, isEdited, canUndo, canRedo } =
    editor;
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
  const selectedZoom = zooms.find((z) => z.id === selectedZoomId) ?? null;
  const format = fileExtension(recording.mimeType).toUpperCase();
  const canSplit = segments.some(
    (s) => playhead > s.start + 0.15 && playhead < s.end - 0.15,
  );

  const cameraOn = !!camera && !camHidden;
  const hasScene = sceneActive(frameStyle, zooms) || cameraOn;
  const edited = isEdited || hasScene;

  const setPlayingBoth = useCallback((value: boolean) => {
    playingRef.current = value;
    setPlaying(value);
  }, []);

  const applySegment = (video: HTMLVideoElement, seg: Segment) => {
    video.muted = seg.muted;
    video.playbackRate = seg.speed;
  };

  function applyFrameStyle(style: FrameStyle) {
    setFrameStyle(style);
    try {
      localStorage.setItem(FRAME_STYLE_KEY, JSON.stringify(style));
    } catch {
      /* persistence is best-effort */
    }
  }

  // --- duration measurement (webm often reports Infinity until sought) ---
  function finalizeDuration(value: number) {
    if (measuredRef.current || !Number.isFinite(value) || value <= 0) return;
    measuredRef.current = true;
    editor.init(value);
    setZoomFactor(1);
    const video = videoRef.current;
    if (video) {
      video.currentTime = 0;
      setDims({ w: video.videoWidth || 0, h: video.videoHeight || 0 });
    }
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

  // --- zoom regions -------------------------------------------------------

  function handleAddZoom() {
    const region = editor.addZoom(playhead);
    if (!region) {
      toast.error("No room for a zoom here.");
      return;
    }
    pause();
    handleSeek((region.start + region.end) / 2);
  }

  function handleSelectZoom(id: string | null) {
    editor.selectZoom(id);
    if (!id) return;
    const region = editor.zooms.find((z) => z.id === id);
    if (region && (playhead < region.start || playhead > region.end)) {
      pause();
      handleSeek((region.start + region.end) / 2);
    }
  }

  // Live zoom preview: a rAF loop maps the playhead through the zoom regions
  // to a CSS transform on the video element (60fps, no React re-renders).
  const zoomsRef = useRef(zooms);
  useEffect(() => {
    zoomsRef.current = zooms;
  });
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const video = videoRef.current;
      if (video && video.videoWidth > 0) {
        const state = zoomStateAt(zoomsRef.current, video.currentTime);
        const transform = cssZoomTransform(
          state,
          video.videoWidth,
          video.videoHeight,
        );
        if (video.style.transform !== transform) {
          video.style.transform = transform;
        }
      }
      // Keep the webcam track locked to the main video: play state,
      // playback rate, and (drift-corrected) time.
      const cam = camRef.current;
      if (cam && video) {
        if (cam.playbackRate !== video.playbackRate) {
          cam.playbackRate = video.playbackRate;
        }
        if (video.paused) {
          if (!cam.paused) cam.pause();
          if (Math.abs(cam.currentTime - video.currentTime) > 0.05) {
            cam.currentTime = video.currentTime;
          }
        } else {
          if (cam.paused) cam.play().catch(() => {});
          if (Math.abs(cam.currentTime - video.currentTime) > 0.2) {
            cam.currentTime = video.currentTime;
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Scale-slider drags collapse into one undo step.
  const scaleDirtyRef = useRef(false);

  // --- focal-point dot: drag on the preview to aim the zoom ---------------
  const dotDragRef = useRef(false);
  const dotDirtyRef = useRef(false);

  const styled = frameStyle.background !== "none" && dims.w > 0 && dims.h > 0;
  const bg = backgroundById(frameStyle.background);
  const stagePs = dims.w > 0 && containerWidth > 0 ? containerWidth / dims.w : 0;
  const stageRect = styled
    ? videoRect(dims.w, dims.h, frameStyle.padding)
    : { x: 0, y: 0, w: dims.w, h: dims.h };

  function dotPosition(): { left: number; top: number } | null {
    if (!selectedZoom || dims.w === 0 || stagePs === 0) return null;
    const state = zoomStateAt(zooms, playhead);
    const crop = cropRect(state, dims.w, dims.h);
    const left =
      (stageRect.x + ((selectedZoom.x * dims.w - crop.x) / crop.w) * stageRect.w) *
      stagePs;
    const top =
      (stageRect.y + ((selectedZoom.y * dims.h - crop.y) / crop.h) * stageRect.h) *
      stagePs;
    return { left, top };
  }

  function handleDotPointerDown(event: React.PointerEvent) {
    event.stopPropagation();
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    dotDragRef.current = true;
  }

  function handleDotPointerMove(event: React.PointerEvent) {
    if (!dotDragRef.current || !selectedZoom || !stageRef.current) return;
    if (dims.w === 0 || stagePs === 0) return;
    if (!dotDirtyRef.current) {
      dotDirtyRef.current = true;
      editor.checkpoint();
    }
    const bounds = stageRef.current.getBoundingClientRect();
    const state = zoomStateAt(zooms, playhead);
    const crop = cropRect(state, dims.w, dims.h);
    const vx = (event.clientX - bounds.left) / stagePs - stageRect.x;
    const vy = (event.clientY - bounds.top) / stagePs - stageRect.y;
    const sx = crop.x + (vx / stageRect.w) * crop.w;
    const sy = crop.y + (vy / stageRect.h) * crop.h;
    editor.updateZoom(selectedZoom.id, { x: sx / dims.w, y: sy / dims.h });
  }

  function handleDotPointerUp(event: React.PointerEvent) {
    dotDragRef.current = false;
    dotDirtyRef.current = false;
    (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
  }

  // --- webcam bubble: drag on the preview to reposition -------------------
  const camDragRef = useRef(false);

  function handleCamPointerDown(event: React.PointerEvent) {
    event.stopPropagation();
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    camDragRef.current = true;
  }

  function handleCamPointerMove(event: React.PointerEvent) {
    if (!camDragRef.current || !stageRef.current) return;
    if (dims.w === 0 || stagePs === 0) return;
    const bounds = stageRef.current.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / stagePs - stageRect.x) / stageRect.w;
    const y = ((event.clientY - bounds.top) / stagePs - stageRect.y) / stageRect.h;
    setCamLayout((layout) => ({
      ...layout,
      x: Math.min(1, Math.max(0, x)),
      y: Math.min(1, Math.max(0, y)),
    }));
  }

  function handleCamPointerUp(event: React.PointerEvent) {
    camDragRef.current = false;
    (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
  }

  // --- keyboard shortcuts (stable listener via an actions ref) ---
  const actionsRef = useRef({
    togglePlay,
    split: () => editor.split(playhead),
    removeSelected: () => {
      if (selectedZoomId) editor.removeZoom(selectedZoomId);
      else if (selectedId) editor.remove(selectedId);
    },
    toggleMute: () => selected && editor.setMuted(selected.id, !selected.muted),
    addZoom: handleAddZoom,
    zoomIn,
    zoomOut,
    undo: editor.undo,
    redo: editor.redo,
  });
  useEffect(() => {
    actionsRef.current = {
      togglePlay,
      split: () => editor.split(playhead),
      removeSelected: () => {
        if (selectedZoomId) editor.removeZoom(selectedZoomId);
        else if (selectedId) editor.remove(selectedId);
      },
      toggleMute: () =>
        selected && editor.setMuted(selected.id, !selected.muted),
      addZoom: handleAddZoom,
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
        case "z":
        case "Z":
          a.addZoom();
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
    const isMp4 = recording.mimeType.includes("mp4");
    // Pure cut/trim (no speed, mute, or scene) can be stream-copied
    // losslessly; edits with effects still need a re-encode.
    const cutOnly =
      editor.segments.every((s) => s.speed === 1 && !s.muted) && !hasScene;
    const filename = downloadName(recording.mimeType, edited);
    const fullName = downloadName(recording.mimeType, false);

    const ffCbs = {
      onLoading: () => setPreparing(true),
      onProgress: (p: number) => {
        setPreparing(false);
        setProgress(p);
      },
    };
    const finish = (blob: Blob, name: string) => {
      const url = URL.createObjectURL(blob);
      saveUrl(url, name);
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast.success("Clip saved", { description: name });
    };

    pause();
    setExporting(true);
    setPreparing(false);
    setProgress(0);
    try {
      // GB-scale recordings don't fit in ffmpeg.wasm's memory — those skip
      // the lossless/remux paths and fall back to a direct save or re-encode.
      const ffmpegOk = canUseFFmpeg(recording.blob);

      // Full recording — mp4 needs its Opus audio remuxed to AAC so native
      // players get sound; webm is left as-is.
      if (!edited) {
        if (isMp4 && ffmpegOk) {
          finish(await toCompatibleMp4(recording.blob, ffCbs), fullName);
        } else {
          saveUrl(recording.url, fullName);
          toast.success("Saved to your device", {
            description:
              isMp4 && !ffmpegOk
                ? "Too large to convert the audio here — if a player stays silent, try VLC."
                : undefined,
          });
        }
        return;
      }

      if (cutOnly && ffmpegOk) {
        try {
          finish(
            await losslessTrim(
              recording.blob,
              recording.mimeType,
              editor.segments,
              ffCbs,
            ),
            filename,
          );
          return;
        } catch {
          // Lossless trim failed — fall back to the re-encode below.
          setPreparing(false);
        }
      }

      // Re-encode: speed/mute/scene edits, oversized recordings, or a
      // failed trim.
      if (!canExportVideo()) {
        saveUrl(recording.url, fullName);
        toast.error(
          "This browser can't apply those edits — saved the full recording.",
        );
        return;
      }
      let blob = await exportSegments(
        recording.url,
        editor.segments,
        recording.mimeType,
        setProgress,
        hasScene
          ? {
              style: frameStyle,
              zooms: editor.zooms,
              camera:
                cameraOn && camera
                  ? { url: camera.url, layout: camLayout }
                  : null,
            }
          : null,
      );
      if (isMp4 && canUseFFmpeg(blob)) blob = await toCompatibleMp4(blob, ffCbs);
      finish(blob, filename);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn't export the clip.",
      );
    } finally {
      setExporting(false);
      setPreparing(false);
    }
  }

  const ready = duration > 0;
  const dot = dotPosition();
  const stageMin = Math.min(dims.w, dims.h);
  const camGeo =
    camera && dims.w > 0 ? cameraGeometry(camLayout, stageRect) : null;

  return (
    <div ref={containerRef} className="flex w-full max-w-3xl flex-col gap-5">
      <div className="relative">
        {/* The stage mirrors the export scene: background, padded video with
            rounded corners and shadow, and the live zoom transform. */}
        <div
          ref={stageRef}
          className="relative w-full overflow-hidden rounded-xl border border-border bg-black shadow-[0_30px_90px_-40px_rgba(0,0,0,0.6)]"
          style={
            styled
              ? {
                  aspectRatio: `${dims.w} / ${dims.h}`,
                  background: bg.css,
                }
              : undefined
          }
        >
          <div
            className={cn(
              "overflow-hidden",
              styled ? "absolute bg-black" : "relative w-full",
            )}
            style={
              styled
                ? {
                    left: stageRect.x * stagePs,
                    top: stageRect.y * stagePs,
                    width: stageRect.w * stagePs,
                    height: stageRect.h * stagePs,
                    borderRadius: radiusPx(frameStyle, stageRect) * stagePs,
                    boxShadow:
                      frameStyle.shadow > 0
                        ? `0 ${frameStyle.shadow * stageMin * 0.025 * stagePs}px ${
                            frameStyle.shadow * stageMin * 0.1 * stagePs
                          }px rgba(0,0,0,${0.25 + frameStyle.shadow * 0.45})`
                        : undefined,
                  }
                : undefined
            }
          >
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
              className={cn(
                "origin-top-left cursor-pointer",
                styled ? "h-full w-full" : "w-full",
              )}
            />

            {/* Webcam bubble — a sibling of the video so the zoom transform
                doesn't drag it along. Drag to reposition. */}
            {camera && camGeo && (
              <div
                onPointerDown={handleCamPointerDown}
                onPointerMove={handleCamPointerMove}
                onPointerUp={handleCamPointerUp}
                className="absolute z-10 cursor-move touch-none overflow-hidden"
                style={{
                  left: (camGeo.cx - camGeo.d / 2 - stageRect.x) * stagePs,
                  top: (camGeo.cy - camGeo.d / 2 - stageRect.y) * stagePs,
                  width: camGeo.d * stagePs,
                  height: camGeo.d * stagePs,
                  borderRadius: camGeo.radius * stagePs,
                  border: camLayout.borderColor
                    ? `${Math.max(1, camGeo.borderW * stagePs)}px solid ${camLayout.borderColor}`
                    : undefined,
                  display: camHidden ? "none" : undefined,
                }}
              >
                <video
                  ref={camRef}
                  src={camera.url}
                  muted
                  playsInline
                  className={cn(
                    "h-full w-full object-cover",
                    camLayout.mirror && "-scale-x-100",
                  )}
                />
              </div>
            )}
          </div>

          {/* Focal point of the selected zoom — drag to re-aim. */}
          {ready && dot && (
            <div
              onPointerDown={handleDotPointerDown}
              onPointerMove={handleDotPointerMove}
              onPointerUp={handleDotPointerUp}
              className="absolute z-10 size-5 -translate-x-1/2 -translate-y-1/2 cursor-move touch-none rounded-full border-2 border-red bg-red/30 shadow-[0_0_0_3px_rgba(0,0,0,0.35)]"
              style={{ left: dot.left, top: dot.top }}
            />
          )}
        </div>
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
            zooms={zooms}
            selectedId={selectedId}
            selectedZoomId={selectedZoomId}
            playhead={playhead}
            pxPerSec={pxPerSec}
            thumbnails={thumbnails}
            onSeek={handleSeek}
            onSelect={(id) => {
              editor.select(id);
              if (!id) editor.selectZoom(null);
            }}
            onSelectZoom={handleSelectZoom}
            onZoomDragStart={editor.checkpoint}
            onZoomChange={editor.updateZoom}
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

            <span className="mx-1 h-5 w-px bg-border" />

            <Button
              size="sm"
              variant="outline"
              onClick={handleAddZoom}
              className="gap-1.5"
            >
              <Focus className="size-3.5" />
              Zoom
            </Button>

            <span className="ml-auto font-mono text-xs text-muted-foreground/70">
              {selectedZoom
                ? "zoom selected"
                : selected
                  ? "segment selected"
                  : "click the timeline to select"}
            </span>
          </div>

          {/* Zoom controls — shown while a zoom region is selected. */}
          {selectedZoom && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface/60 p-3">
              <span className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
                Zoom
              </span>
              <div className="flex min-w-40 flex-1 items-center gap-2">
                <Slider
                  value={[selectedZoom.scale]}
                  min={1.2}
                  max={ZOOM_MAX_SCALE}
                  step={0.1}
                  onValueChange={(v) => {
                    if (!scaleDirtyRef.current) {
                      scaleDirtyRef.current = true;
                      editor.checkpoint();
                    }
                    editor.updateZoom(selectedZoom.id, {
                      scale: sliderValue(v),
                    });
                  }}
                  onValueCommitted={() => {
                    scaleDirtyRef.current = false;
                  }}
                />
                <span className="w-10 shrink-0 font-mono text-xs text-muted-foreground">
                  {selectedZoom.scale.toFixed(1)}×
                </span>
              </div>
              <span className="hidden font-mono text-[11px] text-muted-foreground/70 sm:inline">
                drag the dot in the preview to aim
              </span>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => editor.removeZoom(selectedZoom.id)}
                aria-label="Remove zoom"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          )}

          <FramePanel style={frameStyle} onChange={applyFrameStyle} />

          {camera && (
            <CameraPanel
              layout={camLayout}
              hidden={camHidden}
              onChange={setCamLayout}
              onToggleHidden={() => setCamHidden((h) => !h)}
            />
          )}

          {/* Actions */}
          <div className="flex flex-col-reverse items-center gap-4 border-t border-border pt-5 sm:flex-row sm:justify-between">
            <p className="flex items-center gap-2 font-mono text-sm text-muted-foreground">
              <span className="rounded border border-border px-1.5 py-0.5 text-xs text-foreground">
                {format}
              </span>
              {formatBytes(recording.size)}
              {edited && (
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
                    {preparing
                      ? "Preparing…"
                      : `Exporting ${Math.round(progress * 100)}%`}
                  </>
                ) : (
                  <>
                    <Download className="size-4" />
                    {edited ? "Export clip" : "Download"}
                  </>
                )}
              </Button>
            </div>
          </div>

          {!exportSupported && (
            <p className="text-center text-xs text-muted-foreground">
              Trims export losslessly here; speed, mute, zoom, and frame edits
              aren&apos;t supported in this browser (you&apos;d get the full
              recording).
            </p>
          )}

          <p className="text-center font-mono text-xs text-muted-foreground/70">
            <Kbd>Space</Kbd> play · <Kbd>S</Kbd> split · <Kbd>Z</Kbd> zoom ·{" "}
            <Kbd>Del</Kbd> delete · <Kbd>M</Kbd> mute · <Kbd>+/–</Kbd> zoom ·{" "}
            <Kbd>Ctrl</Kbd>+<Kbd>Z</Kbd> undo
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
