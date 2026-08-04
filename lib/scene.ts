"use client";

// The "scene" is everything drawn around and on top of the raw recording:
// a styled frame (background, padding, rounded corners, shadow), timed zoom
// regions, and the webcam bubble. One model drives both the CSS preview in
// the editor and the canvas renderer used at export, so what you see is what
// you save.

import type { CameraLayout } from "@/lib/camera-layout";

export interface FrameStyle {
  /** Background preset id (see BACKGROUNDS); "none" means the raw video. */
  background: string;
  /** Inset around the video, as a fraction of the shorter frame edge (0–0.2). */
  padding: number;
  /** Corner radius, as a fraction of the shorter video edge (0–0.2). */
  radius: number;
  /** Drop-shadow strength, 0–1. */
  shadow: number;
  /** Shape of the exported frame (see ASPECTS); "source" keeps the capture's. */
  aspect: string;
}

export const DEFAULT_FRAME_STYLE: FrameStyle = {
  background: "none",
  padding: 0.06,
  radius: 0.03,
  shadow: 0.5,
  aspect: "source",
};

/* ---------------------------------------------------------------- */
/* Output shape                                                      */
/* ---------------------------------------------------------------- */

export interface AspectPreset {
  id: string;
  label: string;
  /** Width over height, or null to keep whatever was captured. */
  ratio: number | null;
}

export const ASPECTS: AspectPreset[] = [
  { id: "source", label: "Source", ratio: null },
  { id: "16:9", label: "16:9", ratio: 16 / 9 },
  { id: "1:1", label: "1:1", ratio: 1 },
  { id: "4:5", label: "4:5", ratio: 4 / 5 },
  { id: "9:16", label: "9:16", ratio: 9 / 16 },
];

export function aspectById(id: string): AspectPreset {
  return ASPECTS.find((a) => a.id === id) ?? ASPECTS[0];
}

/** H.264 in 4:2:0 can't encode an odd width or height. */
const even = (value: number) => Math.max(2, Math.round(value / 2) * 2);

/**
 * The size of the exported frame.
 *
 * The long edge is kept from the capture, so a 1920×1080 screen becomes the
 * 1080×1920 that vertical video is actually uploaded at. The recording itself
 * is then fitted inside (see videoRect) and the background fills the rest —
 * which is the whole point of a taller frame: room around the picture.
 */
export function outputSize(
  sourceW: number,
  sourceH: number,
  aspect: string,
): { w: number; h: number } {
  const { ratio } = aspectById(aspect);
  if (!ratio || sourceW <= 0 || sourceH <= 0) {
    return { w: even(sourceW), h: even(sourceH) };
  }
  const long = Math.max(sourceW, sourceH);
  return ratio >= 1
    ? { w: even(long), h: even(long / ratio) }
    : { w: even(long * ratio), h: even(long) };
}

/** A timed zoom-in on a focal point, with eased ramps at both ends. */
export interface ZoomRegion {
  id: string;
  /** Source in/out points, seconds. */
  start: number;
  end: number;
  /** Focal point, 0..1 of the frame. */
  x: number;
  y: number;
  /** Peak magnification (1 = none). */
  scale: number;
  /** Generated from the cursor track rather than placed by hand. */
  auto?: boolean;
}

export const ZOOM_MIN_LENGTH = 0.4;
export const ZOOM_DEFAULT_LENGTH = 3;
export const ZOOM_DEFAULT_SCALE = 1.8;
export const ZOOM_MAX_SCALE = 3;

/* ---------------------------------------------------------------- */
/* Backgrounds                                                       */
/* ---------------------------------------------------------------- */

/** Either 2D context: the export may draw to an OffscreenCanvas. */
export type SceneContext =
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D;

export interface BackgroundPreset {
  id: string;
  label: string;
  /** CSS background value, for the editor preview and swatches. */
  css: string;
  /** Paints the same background onto the export canvas. */
  paint: (ctx: SceneContext, w: number, h: number) => void;
}

interface GradientStop {
  offset: number;
  color: string;
}

// A linear gradient expressed once, rendered identically by CSS and canvas.
// The CSS angle convention (0deg = up, clockwise) is converted to a canvas
// gradient line through the centre, long enough to cover the corners.
function linear(
  id: string,
  label: string,
  angle: number,
  stops: GradientStop[],
): BackgroundPreset {
  const css = `linear-gradient(${angle}deg, ${stops
    .map((s) => `${s.color} ${Math.round(s.offset * 100)}%`)
    .join(", ")})`;
  return {
    id,
    label,
    css,
    paint: (ctx, w, h) => {
      const rad = (angle * Math.PI) / 180;
      const dx = Math.sin(rad);
      const dy = -Math.cos(rad);
      const half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
      const cx = w / 2;
      const cy = h / 2;
      const grad = ctx.createLinearGradient(
        cx - dx * half,
        cy - dy * half,
        cx + dx * half,
        cy + dy * half,
      );
      for (const s of stops) grad.addColorStop(s.offset, s.color);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    },
  };
}

function solid(id: string, label: string, color: string): BackgroundPreset {
  return {
    id,
    label,
    css: color,
    paint: (ctx, w, h) => {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, w, h);
    },
  };
}

export const BACKGROUNDS: BackgroundPreset[] = [
  {
    id: "none",
    label: "None",
    css: "transparent",
    paint: () => {},
  },
  linear("ember", "Ember", 135, [
    { offset: 0, color: "#3d100b" },
    { offset: 0.55, color: "#7c241c" },
    { offset: 1, color: "#1a0c0a" },
  ]),
  linear("paper", "Paper", 160, [
    { offset: 0, color: "#f5f1e8" },
    { offset: 1, color: "#ddd2bb" },
  ]),
  linear("ocean", "Ocean", 135, [
    { offset: 0, color: "#0f2027" },
    { offset: 0.5, color: "#203a43" },
    { offset: 1, color: "#2c5364" },
  ]),
  linear("dusk", "Dusk", 135, [
    { offset: 0, color: "#41295a" },
    { offset: 1, color: "#2f0743" },
  ]),
  linear("sunrise", "Sunrise", 120, [
    { offset: 0, color: "#f8b500" },
    { offset: 1, color: "#f62d22" },
  ]),
  solid("graphite", "Graphite", "#16130f"),
  solid("chalk", "Chalk", "#e9e4d8"),
];

export function backgroundById(id: string): BackgroundPreset {
  return BACKGROUNDS.find((b) => b.id === id) ?? BACKGROUNDS[0];
}

export function isDefaultFrame(style: FrameStyle): boolean {
  return style.background === "none" && style.aspect === "source";
}

/** Whether the scene changes any pixels (and so forces a re-encode). */
export function sceneActive(style: FrameStyle, zooms: ZoomRegion[]): boolean {
  return !isDefaultFrame(style) || zooms.length > 0;
}

/* ---------------------------------------------------------------- */
/* Layout                                                            */
/* ---------------------------------------------------------------- */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

/**
 * Where the video sits inside the frame: inset on every side by an even
 * pixel margin (a fraction of the shorter edge), contain-fitted, centred.
 *
 * `sourceW`/`sourceH` are the recording's own shape, which is only different
 * from the frame's when the export has been reframed — a wide capture in a
 * vertical frame keeps its proportions and sits in the middle of it.
 */
export function videoRect(
  frameW: number,
  frameH: number,
  padding: number,
  sourceW = frameW,
  sourceH = frameH,
): Rect {
  const margin = clamp(padding, 0, 0.35) * Math.min(frameW, frameH);
  const availW = frameW - margin * 2;
  const availH = frameH - margin * 2;
  const scale = Math.min(availW / sourceW, availH / sourceH);
  const w = sourceW * scale;
  const h = sourceH * scale;
  return { x: (frameW - w) / 2, y: (frameH - h) / 2, w, h };
}

/** Corner radius in frame pixels for a given video rect. */
export function radiusPx(style: FrameStyle, rect: Rect): number {
  return clamp(style.radius, 0, 0.3) * Math.min(rect.w, rect.h);
}

/** The webcam bubble's geometry, in frame pixels, inside a video rect. */
export interface CameraGeometry {
  /** Bubble centre. */
  cx: number;
  cy: number;
  /** Bubble diameter. */
  d: number;
  /** Corner radius of the bubble's clip path. */
  radius: number;
  /** Border stroke width (0 when borderless). */
  borderW: number;
}

export function cameraGeometry(
  layout: CameraLayout,
  rect: Rect,
): CameraGeometry {
  const d = clamp(layout.size, 0.08, 0.5) * rect.h;
  const half = d / 2;
  const cx = rect.x + clamp(layout.x * rect.w, half, rect.w - half);
  const cy = rect.y + clamp(layout.y * rect.h, half, rect.h - half);
  const radius = layout.shape === "circle" ? half : d * 0.2;
  const borderW = layout.borderColor
    ? Math.max(1, layout.borderWidth * rect.h)
    : 0;
  return { cx, cy, d, radius, borderW };
}

/* ---------------------------------------------------------------- */
/* Zoom                                                              */
/* ---------------------------------------------------------------- */

export interface ZoomState {
  scale: number;
  /** Focal point, 0..1 of the frame. */
  fx: number;
  fy: number;
}

const ZOOM_RAMP = 0.6; // seconds of ease at each end, capped by region length

function easeInOutCubic(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

/** The interpolated zoom at `time` (scale 1 outside every region). */
export function zoomStateAt(zooms: ZoomRegion[], time: number): ZoomState {
  for (const z of zooms) {
    if (time < z.start || time > z.end) continue;
    const ramp = Math.min(ZOOM_RAMP, (z.end - z.start) / 2);
    let p = 1;
    if (ramp > 0) {
      if (time < z.start + ramp) p = (time - z.start) / ramp;
      else if (time > z.end - ramp) p = (z.end - time) / ramp;
    }
    const eased = easeInOutCubic(clamp(p, 0, 1));
    return { scale: 1 + (z.scale - 1) * eased, fx: z.x, fy: z.y };
  }
  return { scale: 1, fx: 0.5, fy: 0.5 };
}

/**
 * The source-space crop for a zoom state: a window 1/scale the size of the
 * frame, centred on the focal point and clamped inside the frame.
 */
export function cropRect(zoom: ZoomState, w: number, h: number): Rect {
  const cw = w / zoom.scale;
  const ch = h / zoom.scale;
  const x = clamp(zoom.fx * w - cw / 2, 0, w - cw);
  const y = clamp(zoom.fy * h - ch / 2, 0, h - ch);
  return { x, y, w: cw, h: ch };
}

/**
 * CSS transform equivalent of `cropRect` for an element that fills the video
 * box (requires `transform-origin: 0 0` and an `overflow: hidden` parent).
 */
export function cssZoomTransform(
  zoom: ZoomState,
  w: number,
  h: number,
): string {
  if (zoom.scale <= 1.001) return "";
  const crop = cropRect(zoom, w, h);
  const tx = (crop.x / w) * 100;
  const ty = (crop.y / h) * 100;
  return `scale(${zoom.scale.toFixed(4)}) translate(${-tx.toFixed(4)}%, ${-ty.toFixed(4)}%)`;
}
