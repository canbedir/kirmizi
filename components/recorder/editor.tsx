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
  Link2,
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
import { canFastExport, fastExport } from "@/lib/fast-export";
import { canUseFFmpeg, losslessTrim, toCompatibleMp4 } from "@/lib/lossless-trim";
import { generateThumbnails } from "@/lib/thumbnails";
import {
  DEFAULT_FRAME_STYLE,
  ZOOM_MAX_SCALE,
  backgroundCss,
  cameraGeometry,
  cropRect,
  cssZoomTransform,
  FULL_CROP,
  clampCrop,
  cropPixels,
  frameSizeFor,
  isFullCrop,
  NO_BACKGROUND,
  radiusPx,
  sceneActive,
  videoRect,
  zoomStateAt,
  type CropRegion,
  type FrameStyle,
} from "@/lib/scene";
import {
  DEFAULT_CAMERA_LAYOUT,
  type CameraLayout,
} from "@/lib/camera-layout";
import {
  DEFAULT_CURSOR_STYLE,
  autoZoomRegions,
  hasCursorData,
  type CursorStyle,
} from "@/lib/cursor-track";
import {
  drawAnnotationLayer,
  drawCursorLayer,
  type FrameSize,
  type SceneCursor,
} from "@/lib/render-scene";
import {
  DEFAULT_ANNOTATION_COLOR,
  handlesOf,
  moveAnnotation,
  moveHandle,
  type Annotation,
  type AnnotationKind,
} from "@/lib/annotate";
import { createClickVoice, type ClickVoice } from "@/lib/click-sound";
import { palette } from "@/lib/color";
import { loadPicture } from "@/lib/picture";
import { SHARE_PROFILE, fitFrame } from "@/lib/export-profile";
import { canShare } from "@/lib/share";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Timeline } from "@/components/recorder/timeline";
import { FramePanel } from "@/components/recorder/frame-panel";
import { AnnotatePanel } from "@/components/recorder/annotate-panel";
import { ShareDialog, type ShareClip } from "@/components/recorder/share-dialog";
import { CropOverlay } from "@/components/recorder/crop-overlay";
import { CameraPanel } from "@/components/recorder/camera-panel";
import {
  CursorMissNote,
  CursorPanel,
} from "@/components/recorder/cursor-panel";
import { SoundPanel } from "@/components/recorder/sound-panel";
import { TightenButton } from "@/components/recorder/pace-panel";
import { findDeadAir } from "@/lib/dead-air";
import { getEdits, saveEdits } from "@/lib/recordings-store";
import {
  isUntouched,
  packEdits,
  readEdits,
  readFrameStyle,
  type EditSnapshot,
} from "@/lib/edit-state";
import { useAudioAnalysis } from "@/lib/use-audio-analysis";
import {
  DEFAULT_SOUND_STYLE,
  isNeutral,
  treatmentFor,
  type SoundStyle,
} from "@/lib/sound";

const THUMB_COUNT = 14;
const FRAME_STYLE_KEY = "kirmizi:frame-style";
const CURSOR_STYLE_KEY = "kirmizi:cursor-style";
const SOUND_STYLE_KEY = "kirmizi:sound-style";

function loadCursorStyle(): CursorStyle {
  if (typeof window === "undefined") return DEFAULT_CURSOR_STYLE;
  try {
    const raw = localStorage.getItem(CURSOR_STYLE_KEY);
    if (raw) return { ...DEFAULT_CURSOR_STYLE, ...JSON.parse(raw) };
  } catch {
    /* corrupted styles fall back to the default */
  }
  return DEFAULT_CURSOR_STYLE;
}

function loadSoundStyle(): SoundStyle {
  if (typeof window === "undefined") return DEFAULT_SOUND_STYLE;
  try {
    const raw = localStorage.getItem(SOUND_STYLE_KEY);
    if (raw) return { ...DEFAULT_SOUND_STYLE, ...JSON.parse(raw) };
  } catch {
    /* corrupted styles fall back to the default */
  }
  return DEFAULT_SOUND_STYLE;
}

function loadFrameStyle(): FrameStyle {
  if (typeof window === "undefined") return DEFAULT_FRAME_STYLE;
  try {
    const raw = localStorage.getItem(FRAME_STYLE_KEY);
    if (raw) return readFrameStyle(JSON.parse(raw));
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

/**
 * Everything on the page that isn't the stage, in pixels: the header, the
 * transport, the timeline, the toolbar, the shortcut line, the gaps and the
 * page's bottom padding. The stage gets whatever height is left.
 */
const STAGE_BUDGET = 420;

/**
 * The rail's tabs, in the order they're offered.
 *
 * Always all four. A tab that appears only when the recording happens to
 * contain the right thing gives the panel a different address every time,
 * which is most of what made the old stack hard to learn — so Clicks greys
 * out with a reason rather than going missing.
 */
const RAIL_TABS = [
  { id: "frame", label: "Frame", absent: "" },
  { id: "sound", label: "Sound", absent: "" },
  { id: "marks", label: "Marks", absent: "" },
  {
    id: "clicks",
    label: "Clicks",
    absent:
      "Nothing was recorded about the pointer — this needs the companion extension.",
  },
] as const;

type RailTab = (typeof RAIL_TABS)[number]["id"];

export function Editor({
  recording,
  editKey,
  onReset,
}: {
  recording: Recording;
  /** Which stored recording this work belongs to, once it has been filed. */
  editKey?: string | null;
  onReset: () => void;
}) {
  const editor = useVideoEditor();
  const videoRef = useRef<HTMLVideoElement>(null);
  const camRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const zoomLayerRef = useRef<HTMLDivElement>(null);
  const measuredRef = useRef(false);
  // Whether the auto-zoom pass has put its regions in — set without running it
  // when a stored edit brings its own.
  const autoAppliedRef = useRef(false);

  const camera = recording.camera ?? null;
  const [camLayout, setCamLayout] = useState<CameraLayout>(
    camera?.layout ?? DEFAULT_CAMERA_LAYOUT,
  );
  const [camHidden, setCamHidden] = useState(false);

  const cursorTrack = hasCursorData(recording.cursor) ? recording.cursor! : null;
  const [cursorStyle, setCursorStyle] = useState<CursorStyle>(loadCursorStyle);
  const cursorCanvasRef = useRef<HTMLCanvasElement>(null);

  const [soundStyle, setSoundStyle] = useState<SoundStyle>(loadSoundStyle);
  const soundState = useAudioAnalysis(recording.blob);
  const soundTreatment = useMemo(
    () => treatmentFor(soundStyle, soundState.analysis),
    [soundStyle, soundState.analysis],
  );

  // The preview plays through the same level correction the export applies, so
  // turning it on is something you hear rather than something you trust.
  // Routing an element into Web Audio is one-way and one-time, so it happens
  // on the first play and stays connected for the life of the editor.
  const previewLevelRef = useRef<GainNode | null>(null);
  const previewGainRef = useRef(1);
  const routePreviewLevel = useCallback((ctx: AudioContext) => {
    const video = videoRef.current;
    if (previewLevelRef.current || !video) return;
    try {
      const gain = ctx.createGain();
      gain.gain.value = previewGainRef.current;
      ctx.createMediaElementSource(video).connect(gain).connect(ctx.destination);
      previewLevelRef.current = gain;
    } catch {
      /* already routed, or not permitted — leave the element's own audio be */
    }
  }, []);
  useEffect(() => {
    previewGainRef.current = soundTreatment.gain;
    const gain = previewLevelRef.current;
    if (gain) gain.gain.value = soundTreatment.gain;
  }, [soundTreatment.gain]);


  const [sharing, setSharing] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const playingRef = useRef(false);
  const [containerWidth, setContainerWidth] = useState(0);
  const [zoomFactor, setZoomFactor] = useState(1);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const [frameStyle, setFrameStyle] = useState<FrameStyle>(loadFrameStyle);

  // What of the capture is being exported. Per recording, not a preference —
  // a crop means nothing to the next take.
  const [crop, setCrop] = useState<CropRegion>(FULL_CROP);
  // While choosing it, the stage shows the whole capture instead of the crop;
  // you can't aim a rectangle at something you can no longer see.
  const [cropping, setCropping] = useState(false);
  const shownCrop = cropping ? FULL_CROP : crop;
  const [tab, setTab] = useState<RailTab>("frame");
  const [exporting, setExporting] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [progress, setProgress] = useState(0);

  const {
    duration,
    segments,
    zooms,
    annotations,
    selectedId,
    selectedZoomId,
    selectedAnnotationId,
    isEdited,
    canUndo,
    canRedo,
  } =
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
  const selectedAnnotation =
    annotations.find((a) => a.id === selectedAnnotationId) ?? null;
  const format = fileExtension(recording.mimeType).toUpperCase();
  const canSplit = segments.some(
    (s) => playhead > s.start + 0.15 && playhead < s.end - 0.15,
  );

  // The cursor layer is in play whenever the highlight or the sound is on.
  const sceneCursor: SceneCursor | null = useMemo(
    () =>
      cursorTrack && (cursorStyle.clicks || cursorStyle.sound)
        ? { track: cursorTrack, style: cursorStyle }
        : null,
    [cursorTrack, cursorStyle],
  );

  // The Clicks tab has something to say either way: the controls when there
  // is pointer data, or the reason there isn't.
  const clicksTab = !!cursorTrack || !!recording.cursorMiss;
  const cameraOn = !!camera && !camHidden;
  const hasScene =
    sceneActive(frameStyle, zooms, crop) ||
    cameraOn ||
    !!sceneCursor ||
    annotations.length > 0;
  // Whether an edit with effects can be exported at all. The frame-exact path
  // answers for itself; the real-time one answers differently depending on
  // whether there's a scene to draw. Asking both is what keeps the warning
  // below off a browser that was always going to manage it.
  const exportSupported =
    canFastExport(recording.blob, recording.mimeType) ||
    canExportVideo(hasScene);
  // Correcting the level changes the file as surely as a cut does, so it has
  // to count as an edit — otherwise "export" would hand back the original.
  const soundTouched = !isNeutral(soundTreatment);
  const edited = isEdited || hasScene || soundTouched;

  /* ---- picking up where the last visit left off ------------------------ */

  // Until a stored edit has been looked for, nothing is written back and the
  // auto-zoom pass is held: both would otherwise race what's being restored.
  const [restored, setRestored] = useState<"pending" | "none" | "done">(
    "pending",
  );
  useEffect(() => {
    if (!editKey || duration <= 0 || restored !== "pending") return;
    let live = true;
    getEdits(editKey)
      .then((stored) => {
        if (!live) return;
        const snapshot = readEdits(stored, duration);
        if (!snapshot) {
          setRestored("none");
          return;
        }
        editor.restore(snapshot.segments, snapshot.zooms, snapshot.annotations);
        setFrameStyle(snapshot.frame);
        setCrop(snapshot.crop);
        setCursorStyle(snapshot.cursor);
        setSoundStyle(snapshot.sound);
        if (snapshot.camera) {
          setCamLayout(snapshot.camera.layout);
          setCamHidden(snapshot.camera.hidden);
        }
        // Zooms came back with the rest; regenerating them would undo any
        // that were removed by hand.
        autoAppliedRef.current = true;
        setRestored("done");
        toast("Picked up where you left off", {
          description: "Your cuts and settings are as you left them.",
        });
      })
      .catch(() => {
        if (live) setRestored("none");
      });
    return () => {
      live = false;
    };
    // editor.restore is stable; re-running on style changes would fight them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editKey, duration, restored]);

  // With no key there's nothing to look for, so nothing is held up.
  const settled = !editKey || restored !== "pending";

  // What could still come out: recomputed against the kept timeline, so a
  // stretch already cut is never proposed a second time.
  const deadAir = useMemo(
    () =>
      findDeadAir({
        duration,
        segments,
        profile: soundState.analysis?.profile,
        integrated: soundState.analysis?.report.integrated,
        track: cursorTrack,
      }),
    [duration, segments, soundState.analysis, cursorTrack],
  );

  // Write the work back, a beat after it stops changing. Everything the
  // editor holds goes in one record, so reopening restores the whole state
  // rather than a subset of it.
  const snapshot: EditSnapshot = useMemo(
    () => ({
      duration,
      segments,
      zooms,
      annotations,
      frame: frameStyle,
      crop,
      cursor: cursorStyle,
      sound: soundStyle,
      camera: camera ? { layout: camLayout, hidden: camHidden } : null,
    }),
    [duration, segments, zooms, annotations, frameStyle, crop, cursorStyle, soundStyle, camera, camLayout, camHidden],
  );
  useEffect(() => {
    if (!editKey || !settled || duration <= 0) return;
    // An untouched clip has nothing worth remembering; storing it would also
    // freeze today's defaults onto a recording opened months from now.
    if (isUntouched(snapshot, {
      frame: DEFAULT_FRAME_STYLE,
      cursor: DEFAULT_CURSOR_STYLE,
      sound: DEFAULT_SOUND_STYLE,
    })) {
      return;
    }
    const timer = setTimeout(() => {
      void saveEdits(editKey, packEdits(snapshot));
    }, 600);
    return () => clearTimeout(timer);
  }, [editKey, settled, duration, snapshot]);

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
      // This key remembers how you like your frames, and a picture isn't that
      // — it belongs to the one recording, where the edit already keeps it.
      // Leaving it out also stops a slider drag writing a megabyte per step.
      const remembered: FrameStyle =
        style.background.kind === "image"
          ? { ...style, background: NO_BACKGROUND }
          : style;
      localStorage.setItem(FRAME_STYLE_KEY, JSON.stringify(remembered));
    } catch {
      /* persistence is best-effort */
    }
  }

  function applySoundStyle(style: SoundStyle) {
    setSoundStyle(style);
    try {
      localStorage.setItem(SOUND_STYLE_KEY, JSON.stringify(style));
    } catch {
      /* persistence is best-effort */
    }
  }

  function applyCursorStyle(style: CursorStyle) {
    setCursorStyle(style);
    try {
      localStorage.setItem(CURSOR_STYLE_KEY, JSON.stringify(style));
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
    if (!clickAudioRef.current && typeof AudioContext !== "undefined") {
      const ctx = new AudioContext();
      clickAudioRef.current = {
        ctx,
        voice: createClickVoice(ctx, ctx.destination),
      };
    }
    const audioCtx = clickAudioRef.current?.ctx;
    if (audioCtx) {
      audioCtx.resume().catch(() => {});
      routePreviewLevel(audioCtx);
    }
    lastHeardRef.current = t;
    setPlayingBoth(true);
    video.play().catch(() => setPlayingBoth(false));
  }, [editor.segments, playhead, setPlayingBoth, routePreviewLevel]);

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

  // While trimming a segment edge, park the playhead on the trim frame so
  // the preview shows exactly where the cut lands.
  function handleSegmentTrim(
    id: string,
    patch: { start?: number; end?: number },
  ) {
    editor.updateSegment(id, patch);
    const edge = patch.start ?? patch.end;
    if (edge !== undefined) {
      handleSeek(Math.min(duration, Math.max(0, edge)));
    }
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

  function handleSelectAnnotation(id: string | null) {
    editor.selectAnnotation(id);
    if (!id) return;
    // Bring the playhead to it: choosing a mark you can't see and then being
    // handed handles to drag would be a puzzle rather than a tool.
    const mark = editor.annotations.find((a) => a.id === id);
    if (mark && (playhead < mark.start || playhead > mark.end)) {
      pause();
      handleSeek((mark.start + mark.end) / 2);
    }
  }

  function handleAddAnnotation(kind: AnnotationKind) {
    const made = editor.addAnnotation(kind, playhead, lastMarkColorRef.current);
    if (!made) {
      toast.error("This clip is too short to mark up.");
      return;
    }
    pause();
    // The mark is laid around the playhead, so this is where the playhead
    // already is — except at the very start or end of a clip, where it had to
    // be pushed inwards and the playhead has to follow to see it.
    handleSeek((made.start + made.end) / 2);
  }

  // Live zoom preview: a rAF loop maps the playhead through the zoom regions
  // to a CSS transform on the video element (60fps, no React re-renders).
  const zoomsRef = useRef(zooms);
  const cropRef = useRef<CropRegion>(FULL_CROP);
  useEffect(() => {
    zoomsRef.current = zooms;
    cropRef.current = shownCrop;
  });
  // Auto zoom runs on its own as soon as the clip is measured, and undoes
  // itself when switched off — no button to discover. It waits for any stored
  // edit first, which may already carry the zooms it would have proposed.
  useEffect(() => {
    if (!cursorTrack || duration <= 0 || !settled) return;
    if (cursorStyle.autoZoom && !autoAppliedRef.current) {
      autoAppliedRef.current = true;
      const manual = zoomsRef.current.filter((z) => !z.auto);
      editor.setAutoZooms(autoZoomRegions(cursorTrack, duration, manual));
    } else if (!cursorStyle.autoZoom && autoAppliedRef.current) {
      autoAppliedRef.current = false;
      editor.setAutoZooms([]);
    }
    // editor.setAutoZooms is stable; zooms are read through a ref on purpose
    // so regenerating doesn't chase its own output.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursorTrack, duration, cursorStyle.autoZoom, settled]);

  // Geometry + cursor layer for the preview overlay, read by the rAF loop.
  const overlayRef = useRef<{
    cursor: SceneCursor | null;
    annotations: Annotation[];
    w: number;
    h: number;
    radius: number;
    size: FrameSize;
    crop: CropRegion;
  }>({
    cursor: null,
    annotations: [],
    w: 0,
    h: 0,
    radius: 0,
    size: { w: 0, h: 0, sourceW: 0, sourceH: 0 },
    crop: FULL_CROP,
  });

  // Click sounds during preview playback. The context is created on the
  // first play (a user gesture by then) and reused after that.
  const clickAudioRef = useRef<{
    ctx: AudioContext;
    voice: ClickVoice;
  } | null>(null);

  const soundRef = useRef<{ clicks: number[]; enabled: boolean }>({
    clicks: [],
    enabled: false,
  });
  const lastHeardRef = useRef(0);
  useEffect(() => {
    soundRef.current = {
      clicks: cursorTrack ? cursorTrack.clicks.map((c) => c.t / 1000) : [],
      enabled: !!cursorTrack && cursorStyle.sound,
    };
  });
  useEffect(
    () => () => {
      clickAudioRef.current?.voice.dispose();
      clickAudioRef.current?.ctx.close().catch(() => {});
      clickAudioRef.current = null;
    },
    [],
  );
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const video = videoRef.current;
      const layer = zoomLayerRef.current;
      if (video && layer && video.videoWidth > 0) {
        const state = zoomStateAt(zoomsRef.current, video.currentTime);
        const transform = cssZoomTransform(
          state,
          video.videoWidth,
          video.videoHeight,
          cropRef.current,
        );
        if (layer.style.transform !== transform) {
          layer.style.transform = transform;
        }
      }
      // Fire a click sound whenever playback crosses one.
      const sound = soundRef.current;
      if (video && playingRef.current && sound.enabled) {
        const now = video.currentTime;
        const prev = lastHeardRef.current;
        if (now > prev && now - prev < 1) {
          const audio = clickAudioRef.current;
          if (audio) {
            for (const at of sound.clicks) {
              if (at > prev && at <= now) audio.voice.play(audio.ctx.currentTime);
            }
          }
        }
        lastHeardRef.current = now;
      } else if (video) {
        lastHeardRef.current = video.currentTime;
      }

      // Redraw the cursor overlay with the very same routine the export
      // uses, so the preview is a true preview.
      const overlay = cursorCanvasRef.current;
      const geo = overlayRef.current;
      if (overlay && video && geo.w > 0) {
        const w = Math.max(1, Math.round(geo.w));
        const h = Math.max(1, Math.round(geo.h));
        if (overlay.width !== w || overlay.height !== h) {
          overlay.width = w;
          overlay.height = h;
        }
        const ctx = overlay.getContext("2d");
        if (ctx && geo.size.sourceW > 0) {
          ctx.clearRect(0, 0, w, h);
          const state = zoomStateAt(zoomsRef.current, video.currentTime);
          const crop = cropRect(state, geo.size.sourceW, geo.size.sourceH, geo.crop);
          const rect = { x: 0, y: 0, w, h };
          if (geo.cursor) {
            drawCursorLayer(
              ctx,
              geo.cursor,
              video.currentTime,
              crop,
              rect,
              geo.size,
              geo.radius,
            );
          }
          if (geo.annotations.length) {
            drawAnnotationLayer(
              ctx,
              geo.annotations,
              video.currentTime,
              crop,
              rect,
              geo.size,
              geo.radius,
            );
          }
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

  // --- marks: drag them, and their ends, on the preview --------------------
  // The colour of the last mark touched, so a second one matches the first
  // without having to be told to.
  const lastMarkColorRef = useRef(DEFAULT_ANNOTATION_COLOR);
  const markDragRef = useRef<{
    id: string;
    /** A point index, or the whole thing. */
    handle: number | "body";
    from: { x: number; y: number };
    origin: Annotation;
    dirty: boolean;
  } | null>(null);

  /**
   * The colours in the frame showing right now, for the background picker to
   * offer. Drawn small on purpose: the point is what the clip is mostly made
   * of, and a thumbnail answers that as well as a full frame would for a
   * fraction of the work.
   */
  const sampleColors = useCallback((): string[] => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || !video.videoWidth) return [];
    const w = 64;
    const h = Math.max(1, Math.round((w * video.videoHeight) / video.videoWidth));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return [];
    try {
      ctx.drawImage(video, 0, 0, w, h);
      return palette(ctx.getImageData(0, 0, w, h).data, 5);
    } catch {
      // A frame that can't be read is one fewer convenience, not an error.
      return [];
    }
  }, []);

  const cropped = !isFullCrop(shownCrop);
  const styled =
    frameStyle.background.kind !== "none" && dims.w > 0 && dims.h > 0;
  const bgCss = backgroundCss(frameStyle.background);
  // The stage is the exported frame, which isn't always the capture's shape.
  const frame = useMemo(
    () => frameSizeFor(dims.w, dims.h, shownCrop, frameStyle.aspect),
    [dims.w, dims.h, shownCrop, frameStyle.aspect],
  );
  // The picture being placed is the crop, not the whole capture.
  const kept = useMemo(
    () => cropPixels(shownCrop, dims.w, dims.h),
    [shownCrop, dims.w, dims.h],
  );
  const reframed = dims.w > 0 && (frame.w !== dims.w || frame.h !== dims.h);
  // Anything but the raw capture at its own shape gets the laid-out stage.
  const framed = styled || reframed || cropped;
  /**
   * How wide the stage may be, expressed as a budget of viewport height.
   *
   * The stage was only ever told how wide to be, and took whatever height
   * that implied — so on a short window it pushed the timeline off the
   * bottom, and the page scrolled past content that had already ended.
   * Capping the width by the shape gives the same result as capping the
   * height would, without cropping the picture to do it.
   *
   * The budget is what's left of the window once everything that isn't the
   * stage has been paid for: the page header, the transport, the timeline,
   * the toolbar, the shortcut line and the gaps between them. That total is
   * a fixed number of pixels rather than a share of the height, which is why
   * a plain `vh` fraction fits one window size and overflows the next.
   */
  const stageRatio = framed
    ? frame.w / frame.h
    : dims.h > 0
      ? dims.w / dims.h
      : 0;
  const stagePs = frame.w > 0 && containerWidth > 0 ? containerWidth / frame.w : 0;
  const stageRect = framed
    ? videoRect(frame.w, frame.h, styled ? frameStyle.padding : 0, kept.w, kept.h)
    : { x: 0, y: 0, w: dims.w, h: dims.h };
  /** Places the video inside its box so that only the crop shows. */
  const cropStyle = useMemo(
    () => ({
      position: "absolute" as const,
      width: `${100 / shownCrop.w}%`,
      height: `${100 / shownCrop.h}%`,
      left: `${(-shownCrop.x / shownCrop.w) * 100}%`,
      top: `${(-shownCrop.y / shownCrop.h) * 100}%`,
    }),
    [shownCrop],
  );

  // The overlay canvas is backed at source resolution and scaled down by CSS,
  // so its geometry matches the export frame exactly.
  useEffect(() => {
    overlayRef.current = {
      cursor: sceneCursor,
      annotations,
      w: stageRect.w,
      h: stageRect.h,
      radius: styled ? radiusPx(frameStyle, stageRect) : 0,
      size: { w: frame.w, h: frame.h, sourceW: dims.w, sourceH: dims.h },
      crop: shownCrop,
    };
  });

  function dotPosition(): { left: number; top: number } | null {
    if (!selectedZoom || dims.w === 0 || stagePs === 0) return null;
    const state = zoomStateAt(zooms, playhead);
    const crop = cropRect(state, dims.w, dims.h, shownCrop);
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
    const crop = cropRect(state, dims.w, dims.h, shownCrop);
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

  /** Where a point of the capture (0..1) lands on the stage, in CSS pixels. */
  function stagePoint(nx: number, ny: number): { left: number; top: number } | null {
    if (dims.w === 0 || stagePs === 0) return null;
    const state = zoomStateAt(zooms, playhead);
    const crop = cropRect(state, dims.w, dims.h, shownCrop);
    return {
      left:
        (stageRect.x + ((nx * dims.w - crop.x) / crop.w) * stageRect.w) * stagePs,
      top:
        (stageRect.y + ((ny * dims.h - crop.y) / crop.h) * stageRect.h) * stagePs,
    };
  }

  /** The reverse: a pointer on the stage, as a point of the capture. */
  function sourceAt(
    clientX: number,
    clientY: number,
  ): { x: number; y: number } | null {
    const el = stageRef.current;
    if (!el || dims.w === 0 || stagePs === 0) return null;
    const bounds = el.getBoundingClientRect();
    const state = zoomStateAt(zooms, playhead);
    const crop = cropRect(state, dims.w, dims.h, shownCrop);
    const vx = (clientX - bounds.left) / stagePs - stageRect.x;
    const vy = (clientY - bounds.top) / stagePs - stageRect.y;
    return {
      x: (crop.x + (vx / stageRect.w) * crop.w) / dims.w,
      y: (crop.y + (vy / stageRect.h) * crop.h) / dims.h,
    };
  }

  function beginMarkDrag(
    event: React.PointerEvent,
    mark: Annotation,
    handle: number | "body",
  ) {
    event.stopPropagation();
    event.preventDefault();
    const from = sourceAt(event.clientX, event.clientY);
    if (!from) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    editor.selectAnnotation(mark.id);
    markDragRef.current = { id: mark.id, handle, from, origin: mark, dirty: false };
  }

  function moveMarkDrag(event: React.PointerEvent) {
    const drag = markDragRef.current;
    if (!drag) return;
    const at = sourceAt(event.clientX, event.clientY);
    if (!at) return;
    if (!drag.dirty) {
      drag.dirty = true;
      editor.checkpoint();
    }
    const next =
      drag.handle === "body"
        ? moveAnnotation(drag.origin, at.x - drag.from.x, at.y - drag.from.y)
        : moveHandle(drag.origin, drag.handle, at.x, at.y);
    editor.updateAnnotation(drag.id, {
      x: next.x,
      y: next.y,
      x2: next.x2,
      y2: next.y2,
    });
  }

  function endMarkDrag(event: React.PointerEvent) {
    if (!markDragRef.current) return;
    markDragRef.current = null;
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

  /** Everything drawn around the recording, for whichever export wants it. */
  function buildScene(picture: CanvasImageSource | null) {
    if (!hasScene) return null;
    return {
      style: frameStyle,
      crop,
      zooms: editor.zooms,
      annotations: editor.annotations,
      backgroundPicture: picture,
      camera: cameraOn && camera ? { url: camera.url, layout: camLayout } : null,
      cursor: sceneCursor,
    };
  }

  /**
   * The clip at share size: smaller frame, smaller bitrate, and no AAC pass —
   * a shared clip is watched in a browser, and browsers read Opus in an mp4
   * perfectly well. It's only desktop players that don't.
   */
  async function makeShareClip(
    onStep: (fraction: number) => void,
  ): Promise<ShareClip> {
    if (!canFastExport(recording.blob, recording.mimeType)) {
      throw new Error(
        "This browser can't render a clip small enough to share. Download it instead.",
      );
    }
    const picture =
      frameStyle.background.kind === "image"
        ? await loadPicture(frameStyle.background.src)
        : null;
    const result = await fastExport({
      blob: recording.blob,
      mimeType: recording.mimeType,
      segments: editor.segments,
      scene: buildScene(picture),
      cameraBlob: cameraOn && camera ? camera.blob : null,
      sound: soundTreatment,
      profile: SHARE_PROFILE,
      onProgress: onStep,
    });
    const size = fitFrame(frame.w, frame.h, SHARE_PROFILE);
    return {
      blob: result.blob,
      seconds: editor.editedDuration,
      width: size.w,
      height: size.h,
    };
  }

  async function handleExport() {
    const isMp4 = recording.mimeType.includes("mp4");
    // Pure cut/trim (no speed, mute, or scene) can be stream-copied
    // losslessly; edits with effects still need a re-encode.
    const cutOnly =
      editor.segments.every((s) => s.speed === 1 && !s.muted) &&
      !hasScene &&
      !soundTouched;
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
      // The export doesn't always come out in the container it was recorded
      // in — Firefox records WebM, and the frame-exact path writes mp4 — so
      // the name follows the file rather than where it came from.
      const named = name.replace(/\.[^.]+$/, `.${fileExtension(blob.type)}`);
      const url = URL.createObjectURL(blob);
      saveUrl(url, named);
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast.success("Clip saved", { description: named });
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
      //
      // A background picture is decoded here rather than kept ready: it is
      // only ever wanted at this moment, and a frame being drawn can't wait
      // on a decode however local it is.
      const backgroundPicture =
        frameStyle.background.kind === "image"
          ? await loadPicture(frameStyle.background.src)
          : null;
      const scene = buildScene(backgroundPicture);

      // Decode the samples straight through WebCodecs where we can: every
      // frame is rendered exactly once, and it runs several times faster than
      // the clip is long. Anything it can't handle falls through to the old
      // path.
      if (canFastExport(recording.blob, recording.mimeType)) {
        try {
          const fast = await fastExport({
            blob: recording.blob,
            mimeType: recording.mimeType,
            segments: editor.segments,
            scene,
            cameraBlob: cameraOn && camera ? camera.blob : null,
            sound: soundTreatment,
            onProgress: setProgress,
          });
          // Browsers without an AAC encoder leave Opus in the mp4, which
          // native players won't decode. Converting just the audio is quick —
          // the video is copied — and it keeps the output the same everywhere.
          const needsRemux = fast.needsAacRemux && canUseFFmpeg(fast.blob);
          finish(
            needsRemux ? await toCompatibleMp4(fast.blob, ffCbs) : fast.blob,
            filename,
          );
          return;
        } catch {
          setProgress(0);
        }
      }

      if (!canExportVideo(hasScene)) {
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
        scene,
        soundTreatment,
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
  /**
   * The grab points for the selected mark: its own points, plus — for the
   * shapes that have two — a handle in the middle for moving the whole thing
   * rather than reshaping it.
   */
  const markHandles = useMemo(() => {
    if (!selectedAnnotation) return [];
    const points: { x: number; y: number; handle: number | "body" }[] =
      handlesOf(selectedAnnotation).map((p, i) => ({ ...p, handle: i }));
    if (selectedAnnotation.kind !== "text") {
      points.push({
        x: (selectedAnnotation.x + selectedAnnotation.x2) / 2,
        y: (selectedAnnotation.y + selectedAnnotation.y2) / 2,
        handle: "body",
      });
    }
    return points;
  }, [selectedAnnotation]);
  const stageMin = Math.min(dims.w, dims.h);
  const camGeo =
    camera && dims.w > 0 ? cameraGeometry(camLayout, stageRect) : null;

  return (
    <div className="flex w-full max-w-[88rem] flex-col gap-5">
      {/* Two columns, and the split is what each half is *about*: on the left
          the clip and its time — what you look at and cut; on the right how
          the clip looks — what you set once and leave. The rail is measured
          rather than fluid, because a control panel that reflows with the
          window has no shape to remember.

          containerRef is on the left column and not the wrapper: it's what
          the timeline scales itself to, and it must not count the rail. */}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_26rem]">
        <div ref={containerRef} className="flex min-w-0 flex-col gap-5">
      <div
        className="relative mx-auto w-full"
        style={
          stageRatio > 0
            ? {
                maxWidth: `calc(max(14rem, 100vh - ${STAGE_BUDGET}px) * ${stageRatio})`,
              }
            : undefined
        }
      >
        {/* The stage mirrors the export scene: background, padded video with
            rounded corners and shadow, and the live zoom transform. */}
        <div
          ref={stageRef}
          className="relative w-full overflow-hidden rounded-xl border border-border bg-black shadow-[0_30px_90px_-40px_rgba(0,0,0,0.6)]"
          style={
            framed
              ? {
                  aspectRatio: `${frame.w} / ${frame.h}`,
                  background: styled ? bgCss : "#000",
                }
              : undefined
          }
        >
          <div
            className={cn(
              "overflow-hidden",
              framed ? "absolute bg-black" : "relative w-full",
            )}
            style={
              framed
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
            {/* The zoom animates on this layer; the video inside it is placed
                once so that only the crop shows. */}
            <div
              ref={zoomLayerRef}
              className={cn(
                "origin-top-left",
                framed ? "absolute inset-0" : "relative w-full",
              )}
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
                onClick={cropping ? undefined : togglePlay}
                className={cn(!cropping && "cursor-pointer", !framed && "w-full")}
                style={framed ? cropStyle : undefined}
              />
            </div>

            {/* Choosing the area. Sits over the whole capture, which is what
                the stage falls back to showing while this is open. */}
            {cropping && (
              <CropOverlay crop={crop} onChange={(next) => setCrop(next)} />
            )}

            {/* Redrawn pointer, click ripples, and anything drawn on top. */}
            {(sceneCursor || annotations.length > 0) && (
              <canvas
                ref={cursorCanvasRef}
                className="pointer-events-none absolute inset-0 h-full w-full"
              />
            )}

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

          {/* Handles for the selected mark. Only while it's actually on
              screen — dragging something invisible is a guessing game. */}
          {ready &&
            selectedAnnotation &&
            playhead >= selectedAnnotation.start &&
            playhead <= selectedAnnotation.end &&
            markHandles.map((handle, i) => {
              const at = stagePoint(handle.x, handle.y);
              if (!at) return null;
              const body = handle.handle === "body";
              return (
                <div
                  key={`${selectedAnnotation.id}-${i}`}
                  onPointerDown={(e) =>
                    beginMarkDrag(e, selectedAnnotation, handle.handle)
                  }
                  onPointerMove={moveMarkDrag}
                  onPointerUp={endMarkDrag}
                  onPointerCancel={endMarkDrag}
                  aria-label={body ? "Move this mark" : "Reshape this mark"}
                  className={cn(
                    "absolute z-10 -translate-x-1/2 -translate-y-1/2 touch-none border-2 border-red shadow-[0_0_0_3px_rgba(0,0,0,0.35)]",
                    body
                      ? "size-5 cursor-move rounded-full bg-red/30"
                      : "size-4 cursor-grab rounded-xs bg-background/80 active:cursor-grabbing",
                  )}
                  style={{ left: at.left, top: at.top }}
                />
              );
            })}

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
            annotations={annotations}
            selectedId={selectedId}
            selectedZoomId={selectedZoomId}
            selectedAnnotationId={selectedAnnotationId}
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
            onSelectAnnotation={handleSelectAnnotation}
            onAnnotationDragStart={editor.checkpoint}
            onAnnotationChange={editor.updateAnnotation}
            onSegmentDragStart={editor.checkpoint}
            onSegmentTrim={handleSegmentTrim}
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

            {/* Cutting the dead air is cutting, so it belongs here and not in
                a panel. It needs something to have measured first. */}
            {(cursorTrack || soundState.status !== "silent") && (
              <TightenButton
                report={deadAir}
                measuring={soundState.status === "measuring"}
                onTighten={() => {
                  pause();
                  editor.cutRanges(deadAir.ranges);
                  toast.success("Tightened", {
                    description: `Cut ${formatDuration(deadAir.removed * 1000)} of dead air — Ctrl+Z puts it back.`,
                  });
                }}
              />
            )}

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

          <p className="text-center font-mono text-xs text-muted-foreground/70">
            <Kbd>Space</Kbd> play · <Kbd>S</Kbd> split · <Kbd>Z</Kbd> zoom ·{" "}
            <Kbd>Del</Kbd> delete · <Kbd>M</Kbd> mute · <Kbd>+/–</Kbd> zoom ·{" "}
            <Kbd>Ctrl</Kbd>+<Kbd>Z</Kbd> undo
          </p>
        </>
      )}
        </div>

        {/* The rail: how the clip looks, one thing at a time.

            Four tabs, always four — a panel that comes and goes with what the
            recording happens to contain leaves nothing to remember. Clicks
            and Camera grey out with a reason instead of vanishing.

            It sticks, and scrolls inside itself, so the export button is
            reachable from anywhere in a long panel. */}
        {ready && (
          <aside className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface/40 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)]">
            <div
              role="tablist"
              aria-label="Clip controls"
              className="grid shrink-0 grid-cols-4 border-b border-border"
            >
              {RAIL_TABS.map((t) => {
                const off = t.id === "clicks" && !clicksTab;
                return (
                  <button
                    key={t.id}
                    role="tab"
                    type="button"
                    aria-selected={tab === t.id}
                    disabled={off}
                    title={off ? t.absent : undefined}
                    onClick={() => setTab(t.id)}
                    className={cn(
                      "border-b-2 px-1 py-2.5 text-sm font-medium transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red/40",
                      tab === t.id
                        ? "border-red text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground",
                      off && "cursor-not-allowed opacity-40 hover:text-muted-foreground",
                    )}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>

            {/* The panels used to draw their own bordered box because they
                were stacked in the page and needed telling apart. The rail is
                the box now, and only one of them is ever in it, so the boxes
                came off at the source rather than being overridden here. */}
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {tab === "frame" && (
                <div className="flex flex-col gap-3">
                  <FramePanel
                    style={frameStyle}
                    onChange={applyFrameStyle}
                    crop={crop}
                    cropping={cropping}
                    source={dims}
                    onToggleCrop={() => setCropping((on) => !on)}
                    onCrop={(next) => {
                      setCrop(clampCrop(next));
                      if (isFullCrop(next)) setCropping(false);
                    }}
                    sampleColors={sampleColors}
                  />
                  {/* The bubble is part of how the picture is arranged, so it
                      lives with the rest of the arranging — under a rule,
                      because it is still its own subject. */}
                  {camera && (
                    <div className="border-t border-border pt-3">
                      <CameraPanel
                        layout={camLayout}
                        hidden={camHidden}
                        onChange={setCamLayout}
                        onToggleHidden={() => setCamHidden((h) => !h)}
                      />
                    </div>
                  )}
                </div>
              )}
              {tab === "sound" && (
                <SoundPanel
                  style={soundStyle}
                  state={soundState}
                  onChange={applySoundStyle}
                />
              )}
              {tab === "marks" && (
                <AnnotatePanel
                  annotations={annotations}
                  selected={selectedAnnotation}
                  onAdd={handleAddAnnotation}
                  onSelect={handleSelectAnnotation}
                  onRemove={editor.removeAnnotation}
                  onChange={(id, patch) => {
                    if (patch.color) lastMarkColorRef.current = patch.color;
                    editor.updateAnnotation(id, patch);
                  }}
                  onCheckpoint={editor.checkpoint}
                />
              )}
              {tab === "clicks" &&
                (cursorTrack ? (
                  <CursorPanel
                    style={cursorStyle}
                    clickCount={cursorTrack.clicks.length}
                    zoomCount={zooms.filter((z) => z.auto).length}
                    onChange={applyCursorStyle}
                  />
                ) : recording.cursorMiss ? (
                  <CursorMissNote
                    miss={recording.cursorMiss}
                    surface={recording.capture?.displaySurface}
                  />
                ) : null)}
            </div>

            <div className="flex shrink-0 flex-col gap-3 border-t border-border p-3">
              {/* Actions.
                  Stacked, because the rail is 20rem and the old row put the
                  export button off the edge of it. Export is the whole width
                  and the only coloured thing here; a link and a re-take share
                  the line under it, which is the order of how often each is
                  wanted. */}
              <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
                <span className="rounded border border-border px-1.5 py-0.5 text-foreground">
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
              </div>

              <Button
                onClick={handleExport}
                disabled={exporting}
                className="w-full gap-2 bg-red text-red-foreground hover:bg-red-hover"
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

              <div className="flex items-center gap-2">
                {canShare() && (
                  // Secondary on purpose. Downloading is what this app does;
                  // sending a copy somewhere is the exception you opt into.
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSharing(true)}
                    disabled={exporting}
                    className="flex-1 gap-1.5"
                    title="Upload a copy and get a link to it"
                  >
                    <Link2 className="size-3.5" />
                    Get a link
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onReset}
                  disabled={exporting}
                  className="flex-1 gap-1.5"
                >
                  <RotateCcw className="size-3.5" />
                  Record again
                </Button>
              </div>

              {!exportSupported && (
                <p className="text-center text-xs text-muted-foreground">
                  Trims export losslessly here; speed, mute, zoom, and frame edits
                  aren&apos;t supported in this browser (you&apos;d get the full
                  recording).
                </p>
              )}
            </div>
          </aside>
        )}
      </div>

      <ShareDialog
        open={sharing}
        onOpenChange={setSharing}
        seconds={editor.editedDuration}
        makeClip={makeShareClip}
      />
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border px-1 py-0.5">{children}</kbd>
  );
}
