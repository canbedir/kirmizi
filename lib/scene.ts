"use client";

// The "scene" is everything drawn around and on top of the raw recording:
// a styled frame (background, padding, rounded corners, shadow), timed zoom
// regions, and the webcam bubble. One model drives both the CSS preview in
// the editor and the canvas renderer used at export, so what you see is what
// you save.

import type { CameraLayout } from "@/lib/camera-layout";
import { shade } from "@/lib/color";

export interface FrameStyle {
  /** What sits behind the recording (see Background); "none" is the raw video. */
  background: Background;
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
  background: { kind: "none" },
  padding: 0.06,
  radius: 0.03,
  shadow: 0.5,
  aspect: "source",
};

/* ---------------------------------------------------------------- */
/* Crop                                                              */
/* ---------------------------------------------------------------- */

/**
 * The part of the recording that gets exported, as fractions of the capture.
 *
 * A screen is captured whole because that's all `getDisplayMedia` offers, but
 * the interesting part is often one window or one corner. Choosing it here
 * rather than at capture time keeps the decision reversible — the recording
 * on disk is still the whole screen.
 *
 * Zooms compose inside it: the crop says what the shot is, a zoom says where
 * to push in within that shot.
 */
export interface CropRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const FULL_CROP: CropRegion = { x: 0, y: 0, w: 1, h: 1 };

/** Smallest fraction of the capture a crop may keep, per axis. */
export const CROP_MIN = 0.08;

export function isFullCrop(crop: CropRegion | null | undefined): boolean {
  if (!crop) return true;
  return (
    crop.x <= 1e-4 &&
    crop.y <= 1e-4 &&
    crop.w >= 1 - 1e-4 &&
    crop.h >= 1 - 1e-4
  );
}

/** Keep a crop inside the capture, and big enough to be worth having. */
export function clampCrop(crop: CropRegion): CropRegion {
  const w = clamp(crop.w, CROP_MIN, 1);
  const h = clamp(crop.h, CROP_MIN, 1);
  return { x: clamp(crop.x, 0, 1 - w), y: clamp(crop.y, 0, 1 - h), w, h };
}

/**
 * The largest crop of a given shape that fits the capture, centred.
 *
 * Asking for 9:16 without one leaves a wide picture stranded in the middle of
 * a tall frame; this takes a vertical slice out of the screen instead, which
 * is what a vertical clip of a desktop actually wants to be.
 */
export function fitCrop(
  sourceW: number,
  sourceH: number,
  ratio: number | null,
): CropRegion {
  if (!ratio || sourceW <= 0 || sourceH <= 0) return FULL_CROP;
  const captured = sourceW / sourceH;
  if (ratio > captured) {
    const h = captured / ratio;
    return { x: 0, y: (1 - h) / 2, w: 1, h };
  }
  const w = ratio / captured;
  return { x: (1 - w) / 2, y: 0, w, h: 1 };
}

/** The crop in capture pixels. */
export function cropPixels(
  crop: CropRegion | null | undefined,
  sourceW: number,
  sourceH: number,
): Rect {
  const c = crop ?? FULL_CROP;
  return {
    x: c.x * sourceW,
    y: c.y * sourceH,
    w: c.w * sourceW,
    h: c.h * sourceH,
  };
}

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

/**
 * The exported frame, given what was captured, what of it was kept, and the
 * shape asked for. A crop is what the export is *of*, so with no shape chosen
 * the file comes out at the crop's own size — cropping in is the same as
 * making the picture bigger.
 */
export function frameSizeFor(
  sourceW: number,
  sourceH: number,
  crop: CropRegion | null | undefined,
  aspect: string,
): { w: number; h: number } {
  const kept = cropPixels(crop, sourceW, sourceH);
  return outputSize(kept.w, kept.h, aspect);
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

export interface GradientStop {
  /** Position along the gradient line, 0–1. */
  offset: number;
  color: string;
}

/**
 * What sits behind the recording.
 *
 * A value rather than the name of one, so a preset is a starting point you can
 * take apart instead of a fixed list you have to live within: pick Ocean, drag
 * the angle, change one of its colours, and it's yours. The presets below are
 * ordinary values of this type with nothing special about them.
 */
export type Background =
  | { kind: "none" }
  | { kind: "solid"; color: string }
  | { kind: "linear"; angle: number; stops: GradientStop[] };

export const NO_BACKGROUND: Background = { kind: "none" };

/** Angles the gradient control snaps between, in CSS degrees. */
export const GRADIENT_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

/** How many colours a gradient may carry — two to shape it, three to bend it. */
export const MIN_STOPS = 2;
export const MAX_STOPS = 3;

/** CSS background value, for the editor preview and the swatches. */
export function backgroundCss(bg: Background): string {
  if (bg.kind === "none") return "transparent";
  if (bg.kind === "solid") return bg.color;
  return `linear-gradient(${bg.angle}deg, ${bg.stops
    .map((s) => `${s.color} ${Math.round(s.offset * 100)}%`)
    .join(", ")})`;
}

/**
 * Paint the same background onto the export canvas.
 *
 * The CSS angle convention (0deg points up, and turns clockwise) becomes a
 * gradient line through the centre, long enough that its ends clear the
 * corners — so the two renderers agree on every pixel rather than merely
 * looking similar.
 */
export function paintBackground(
  ctx: SceneContext,
  bg: Background,
  w: number,
  h: number,
): void {
  if (bg.kind === "none") return;
  if (bg.kind === "solid") {
    ctx.fillStyle = bg.color;
    ctx.fillRect(0, 0, w, h);
    return;
  }
  const rad = (bg.angle * Math.PI) / 180;
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
  for (const s of bg.stops) grad.addColorStop(clamp(s.offset, 0, 1), s.color);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

/** Whether two backgrounds would paint the same picture. */
export function sameBackground(a: Background, b: Background): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "none") return true;
  if (a.kind === "solid") return a.color === (b as typeof a).color;
  const other = b as typeof a;
  return (
    a.angle === other.angle &&
    a.stops.length === other.stops.length &&
    a.stops.every(
      (s, i) =>
        s.color === other.stops[i].color &&
        Math.abs(s.offset - other.stops[i].offset) < 1e-6,
    )
  );
}

export interface BackgroundPreset {
  id: string;
  label: string;
  value: Background;
}

const linear = (
  id: string,
  label: string,
  angle: number,
  stops: GradientStop[],
): BackgroundPreset => ({ id, label, value: { kind: "linear", angle, stops } });

const solid = (id: string, label: string, color: string): BackgroundPreset => ({
  id,
  label,
  value: { kind: "solid", color },
});

export const BACKGROUND_PRESETS: BackgroundPreset[] = [
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

/** The preset a background came from, if it's still untouched. */
export function presetOf(bg: Background): BackgroundPreset | null {
  return BACKGROUND_PRESETS.find((p) => sameBackground(p.value, bg)) ?? null;
}

/**
 * A gradient built from a single colour: the colour itself falling away to a
 * darker version of the same hue. One pick, and the frame has depth rather
 * than a flat wall behind it.
 */
export function gradientFrom(color: string): Background {
  return {
    kind: "linear",
    angle: 135,
    stops: [
      { offset: 0, color },
      { offset: 1, color: shade(color, 0.55) },
    ],
  };
}

/** Evenly spread whatever stops a gradient has, after one is added or removed. */
export function spreadStops(stops: GradientStop[]): GradientStop[] {
  if (stops.length < 2) return stops;
  return stops.map((s, i) => ({ ...s, offset: i / (stops.length - 1) }));
}

export function isDefaultFrame(style: FrameStyle): boolean {
  return style.background.kind === "none" && style.aspect === "source";
}

/** Whether the scene changes any pixels (and so forces a re-encode). */
export function sceneActive(
  style: FrameStyle,
  zooms: ZoomRegion[],
  crop?: CropRegion | null,
): boolean {
  return !isDefaultFrame(style) || zooms.length > 0 || !isFullCrop(crop);
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
export function cropRect(
  zoom: ZoomState,
  w: number,
  h: number,
  base?: CropRegion | null,
): Rect {
  // The zoom works inside the crop, not inside the capture: cropping decides
  // what the shot is, zooming decides where to look within it.
  const b = cropPixels(base, w, h);
  const cw = b.w / zoom.scale;
  const ch = b.h / zoom.scale;
  // Focal points stay in capture coordinates — that's what the cursor track
  // and hand-placed zooms are in — and get held inside the crop.
  const x = clamp(zoom.fx * w - cw / 2, b.x, b.x + b.w - cw);
  const y = clamp(zoom.fy * h - ch / 2, b.y, b.y + b.h - ch);
  return { x, y, w: cw, h: ch };
}

/**
 * CSS transform equivalent of `cropRect` for an element whose box already
 * shows the crop (requires `transform-origin: 0 0` and an `overflow: hidden`
 * parent). Expressed relative to the crop, so the static framing can be laid
 * out once and only the zoom animates.
 */
export function cssZoomTransform(
  zoom: ZoomState,
  w: number,
  h: number,
  base?: CropRegion | null,
): string {
  if (zoom.scale <= 1.001) return "";
  const b = cropPixels(base, w, h);
  const crop = cropRect(zoom, w, h, base);
  const tx = ((crop.x - b.x) / b.w) * 100;
  const ty = ((crop.y - b.y) / b.h) * 100;
  // Parenthesised: `-tx.toFixed(4)` negates the *string*, which coerces back
  // to a number and throws the fixed precision away.
  return `scale(${zoom.scale.toFixed(4)}) translate(${(-tx).toFixed(4)}%, ${(-ty).toFixed(4)}%)`;
}
