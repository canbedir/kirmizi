"use client";

// Canvas renderer for the scene: paints one styled frame (background, padded
// video with rounded corners and shadow, zoom crop) from a playing <video>
// element. Used by the export pipeline; the editor previews the same model
// with CSS. Fully client-side.

import {
  cameraGeometry,
  cropPixels,
  cropRect,
  paintBackground,
  radiusPx,
  videoRect,
  zoomStateAt,
  type CropRegion,
  type FrameStyle,
  type Rect,
  type SceneContext,
  type ZoomRegion,
} from "@/lib/scene";
import type { CameraLayout } from "@/lib/camera-layout";
import { annotationsAt, type Annotation } from "@/lib/annotate";
import {
  clickEffectsAt,
  type CursorStyle,
  type CursorTrack,
} from "@/lib/cursor-track";

export interface SceneCamera {
  /** Object URL of the recorded webcam track. */
  url: string;
  layout: CameraLayout;
}

export interface SceneCursor {
  track: CursorTrack;
  style: CursorStyle;
}

/**
 * A picture to draw, with its own dimensions. The real-time exporter passes
 * <video> elements; the frame-exact one passes decoded VideoFrames.
 */
export interface SceneImage {
  image: CanvasImageSource;
  width: number;
  height: number;
}

/**
 * The frame being drawn, and the recording it's drawn from. The two are the
 * same size until the export is reframed — a 16:9 capture in a 9:16 frame.
 */
export interface FrameSize {
  /** The canvas being painted. */
  w: number;
  h: number;
  /** The recording's own dimensions, which cursor and zoom maths are in. */
  sourceW: number;
  sourceH: number;
}

/** A frame the same shape as what was captured. */
export function sameSize(w: number, h: number): FrameSize {
  return { w, h, sourceW: w, sourceH: h };
}

/** Wrap a video element, or null if it has no frame to give yet. */
export function imageOfVideo(
  video: HTMLVideoElement | null | undefined,
): SceneImage | null {
  if (!video || video.readyState < 2 || !video.videoWidth) return null;
  return { image: video, width: video.videoWidth, height: video.videoHeight };
}

export interface Scene {
  style: FrameStyle;
  /** The part of the capture being exported; zooms work inside it. */
  crop?: CropRegion | null;
  zooms: ZoomRegion[];
  /** Marks drawn on top of the recording that were never on the screen. */
  annotations?: Annotation[] | null;
  /** The decoded background picture, when the frame is one. */
  backgroundPicture?: CanvasImageSource | null;
  /** Present when a webcam bubble should be composited over the video. */
  camera?: SceneCamera | null;
  /** Present when a synthetic cursor should be drawn over the video. */
  cursor?: SceneCursor | null;
}

function roundRectPath(ctx: SceneContext, rect: Rect, radius: number) {
  ctx.beginPath();
  if (radius > 0 && typeof ctx.roundRect === "function") {
    ctx.roundRect(rect.x, rect.y, rect.w, rect.h, radius);
  } else {
    // Safari < 16.4 lacks roundRect — fall back to sharp corners.
    ctx.rect(rect.x, rect.y, rect.w, rect.h);
  }
}

/* ---------------------------------------------------------------- */
/* Cursor layer                                                      */
/* ---------------------------------------------------------------- */

const RED = "#f62d22";

/** Normalised source point (0..1) → frame pixels, through the zoom crop. */
function mapPoint(
  nx: number,
  ny: number,
  crop: Rect,
  rect: Rect,
  frameW: number,
  frameH: number,
): { x: number; y: number } {
  return {
    x: rect.x + ((nx * frameW - crop.x) / crop.w) * rect.w,
    y: rect.y + ((ny * frameH - crop.y) / crop.h) * rect.h,
  };
}

const easeOut = (p: number, power = 3) => 1 - Math.pow(1 - p, power);
/** Remap a sub-phase of the effect onto its own 0..1. */
const phase = (p: number, until: number) => Math.min(1, p / until);

/**
 * The click, in three layers that each run on their own clock.
 *
 * A halo lifts the moment off whatever's underneath, so the effect reads on
 * dark and light interfaces alike. A core flashes and is gone within a fifth
 * of a second — that's the part the eye registers as impact. The ring then
 * expands and thins out over the rest, which is what makes it feel like a
 * release rather than a blink. Everything is drawn twice, once in a dark
 * shade a hair wider, so it stays legible against white UI.
 */
function drawClick(
  ctx: SceneContext,
  x: number,
  y: number,
  base: number,
  progress: number,
  secondary: boolean,
) {
  const color = secondary ? RED : "#ffffff";
  ctx.save();

  // 1. Halo — a soft bloom that fades over most of the life.
  const haloP = phase(progress, 0.8);
  const haloAlpha = (1 - haloP) * 0.22;
  if (haloAlpha > 0.002) {
    const haloR = base * (1.1 + 0.5 * easeOut(haloP));
    const halo = ctx.createRadialGradient(x, y, 0, x, y, haloR);
    halo.addColorStop(0, color);
    halo.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.globalAlpha = haloAlpha;
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(x, y, haloR, 0, Math.PI * 2);
    ctx.fill();
  }

  // 2. Core — the impact. Brief, but it has to actually register.
  const coreP = phase(progress, 0.32);
  if (coreP < 1) {
    ctx.globalAlpha = Math.pow(1 - coreP, 1.4) * 0.62;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, base * (0.5 - 0.14 * coreP), 0, Math.PI * 2);
    ctx.fill();
  }

  // 3. Ring — expands and thins, carrying the rest of the moment.
  const ringP = easeOut(progress);
  const radius = base * (0.34 + 0.78 * ringP);
  const fade = Math.pow(1 - progress, 1.3);
  const width = Math.max(1.5, base * (0.22 - 0.13 * ringP));
  ctx.lineJoin = "round";
  // Dark underlay first, so the ring survives on light backgrounds.
  ctx.globalAlpha = fade * 0.3;
  ctx.strokeStyle = "rgba(15, 13, 12, 1)";
  ctx.lineWidth = width + Math.max(1, base * 0.045);
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.globalAlpha = fade * 0.95;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

/**
 * Draw the click effects over the video area. Shared by the export renderer
 * and the editor's preview overlay so both show exactly the same thing.
 *
 * The effect keeps a constant on-screen size regardless of zoom: growing it
 * with the crop would turn a 3× push-in into a dinner plate.
 */
export function drawCursorLayer(
  ctx: SceneContext,
  cursor: SceneCursor,
  time: number,
  crop: Rect,
  rect: Rect,
  size: FrameSize,
  radius = 0,
) {
  const { track, style } = cursor;
  if (!style.clicks) return;

  const effects = clickEffectsAt(track, time);
  if (!effects.length) return;

  ctx.save();
  roundRectPath(ctx, rect, radius);
  ctx.clip();

  // Sized against the frame rather than the video, so it reads the same
  // whatever the picture has been padded or reframed to.
  const base = style.size * size.h;
  for (const effect of effects) {
    const p = mapPoint(effect.x, effect.y, crop, rect, size.sourceW, size.sourceH);
    drawClick(ctx, p.x, p.y, base, effect.progress, effect.secondary);
  }
  ctx.restore();
}

/* ---------------------------------------------------------------- */
/* Annotation layer                                                  */
/* ---------------------------------------------------------------- */

/**
 * The font annotations are set in. Geist is the page's own, and it's loaded by
 * the time anything can be exported; the rest is there so a frame is never
 * drawn in whatever the canvas defaults to.
 */
const ANNOTATION_FONT =
  'Geist, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';

/** Lifts a mark off whatever it lands on, without an outline's cheapness. */
function liftOff(ctx: SceneContext, px: number) {
  ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
  ctx.shadowBlur = px * 0.5;
  ctx.shadowOffsetY = px * 0.12;
}

function drawText(
  ctx: SceneContext,
  a: Annotation,
  at: { x: number; y: number },
  frameH: number,
) {
  const px = Math.max(8, a.size * frameH);
  ctx.font = `600 ${px}px ${ANNOTATION_FONT}`;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillStyle = a.color;
  liftOff(ctx, px * 0.35);
  // Line breaks are the author's: wrapping text the writer didn't ask for
  // moves it around as the frame changes shape, which is the one thing a
  // label must not do.
  const lines = a.text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], at.x, at.y + i * px * 1.25);
  }
}

function drawArrow(
  ctx: SceneContext,
  a: Annotation,
  from: { x: number; y: number },
  to: { x: number; y: number },
  frameH: number,
) {
  const weight = Math.max(2, a.size * frameH * 0.34);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length < 1) return;
  const ux = dx / length;
  const uy = dy / length;

  const head = Math.min(weight * 3.4, length);
  const halfHead = head * 0.46;
  // The shaft stops where the head begins, or the head's fill and the line's
  // cap pile up into a blunt lump at the tip.
  const shaftX = to.x - ux * head * 0.86;
  const shaftY = to.y - uy * head * 0.86;

  ctx.save();
  liftOff(ctx, weight);
  ctx.strokeStyle = a.color;
  ctx.fillStyle = a.color;
  ctx.lineWidth = weight;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(shaftX, shaftY);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - ux * head + -uy * halfHead, to.y - uy * head + ux * halfHead);
  ctx.lineTo(to.x - ux * head + uy * halfHead, to.y - uy * head - ux * halfHead);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawBox(
  ctx: SceneContext,
  a: Annotation,
  from: { x: number; y: number },
  to: { x: number; y: number },
  frameH: number,
) {
  const weight = Math.max(2, a.size * frameH * 0.22);
  const x = Math.min(from.x, to.x);
  const y = Math.min(from.y, to.y);
  const w = Math.abs(to.x - from.x);
  const h = Math.abs(to.y - from.y);
  if (w < 1 || h < 1) return;

  ctx.save();
  liftOff(ctx, weight);
  ctx.strokeStyle = a.color;
  ctx.lineWidth = weight;
  ctx.lineJoin = "round";
  roundRectPath(ctx, { x, y, w, h }, Math.min(weight * 1.4, w / 2, h / 2));
  ctx.stroke();
  ctx.restore();
}

/**
 * Draw the annotations showing at `time` over the video area.
 *
 * Shared by the export renderer and the editor's preview overlay, so both
 * show the same thing. Positions come through the zoom crop — an arrow stays
 * on what it was pointing at — while sizes are measured against the frame, so
 * a label doesn't grow with a push-in.
 */
export function drawAnnotationLayer(
  ctx: SceneContext,
  annotations: Annotation[],
  time: number,
  crop: Rect,
  rect: Rect,
  size: FrameSize,
  radius = 0,
) {
  const shown = annotationsAt(annotations, time);
  if (!shown.length) return;

  ctx.save();
  roundRectPath(ctx, rect, radius);
  ctx.clip();

  for (const { annotation, opacity } of shown) {
    if (opacity <= 0.002) continue;
    const from = mapPoint(
      annotation.x,
      annotation.y,
      crop,
      rect,
      size.sourceW,
      size.sourceH,
    );
    const to = mapPoint(
      annotation.x2,
      annotation.y2,
      crop,
      rect,
      size.sourceW,
      size.sourceH,
    );
    ctx.save();
    ctx.globalAlpha = opacity;
    if (annotation.kind === "text") drawText(ctx, annotation, from, size.h);
    else if (annotation.kind === "arrow") drawArrow(ctx, annotation, from, to, size.h);
    else drawBox(ctx, annotation, from, to, size.h);
    ctx.restore();
  }

  ctx.restore();
}

/** Draw the webcam bubble (cover-cropped, clipped, mirrored, bordered). */
function drawCameraBubble(
  ctx: SceneContext,
  cam: SceneImage,
  layout: CameraLayout,
  rect: Rect,
) {
  const { cx, cy, d, radius, borderW } = cameraGeometry(layout, rect);
  const half = d / 2;
  const cw = cam.width || 1;
  const ch = cam.height || 1;
  const side = Math.min(cw, ch);
  const sx = (cw - side) / 2;
  const sy = (ch - side) / 2;

  const path = () => {
    ctx.beginPath();
    if (layout.shape === "circle") {
      ctx.arc(cx, cy, half, 0, Math.PI * 2);
    } else if (typeof ctx.roundRect === "function") {
      ctx.roundRect(cx - half, cy - half, d, d, radius);
    } else {
      ctx.rect(cx - half, cy - half, d, d);
    }
  };

  ctx.save();
  path();
  ctx.clip();
  if (layout.mirror) {
    // Mirror around the bubble's own centre: x' = 2cx − x.
    ctx.translate(cx * 2, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(cam.image, sx, sy, side, side, cx - half, cy - half, d, d);
  ctx.restore();

  if (borderW > 0 && layout.borderColor) {
    path();
    ctx.lineWidth = borderW;
    ctx.strokeStyle = layout.borderColor;
    ctx.stroke();
  }
}

/**
 * Draw the scene for the frame at `time` (source seconds) onto a canvas of the
 * video's own dimensions. The webcam picture (when the scene has one) is drawn
 * on top, unaffected by the zoom crop.
 */
export function drawSceneFrame(
  ctx: SceneContext,
  video: CanvasImageSource,
  scene: Scene,
  size: FrameSize,
  time: number,
  cam?: SceneImage | null,
) {
  const { w: frameW, h: frameH, sourceW, sourceH } = size;
  const bg = scene.style.background;
  const styled = bg.kind !== "none";

  // Background. With no background chosen and the capture's own shape the
  // video covers the whole frame, but paint black anyway so nothing shows
  // through at the edges of a reframed export.
  if (styled) {
    paintBackground(ctx, bg, frameW, frameH, scene.backgroundPicture);
  } else {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, frameW, frameH);
  }

  // The picture being placed is the crop, not the whole capture, so the
  // contain-fit is against its shape. Padding only applies to a styled frame,
  // but the fit always does: that's what puts a wide picture in the middle of
  // a vertical export.
  const kept = cropPixels(scene.crop, sourceW, sourceH);
  const rect = videoRect(
    frameW,
    frameH,
    styled ? scene.style.padding : 0,
    kept.w,
    kept.h,
  );
  const radius = styled ? radiusPx(scene.style, rect) : 0;

  // Shadow, drawn as a filled plate underneath the video.
  if (styled && scene.style.shadow > 0) {
    const min = Math.min(frameW, frameH);
    ctx.save();
    ctx.shadowColor = `rgba(0, 0, 0, ${0.25 + scene.style.shadow * 0.45})`;
    ctx.shadowBlur = scene.style.shadow * min * 0.1;
    ctx.shadowOffsetY = scene.style.shadow * min * 0.025;
    roundRectPath(ctx, rect, radius);
    ctx.fillStyle = "#000";
    ctx.fill();
    ctx.restore();
  }

  const zoom = zoomStateAt(scene.zooms, time);
  const crop = cropRect(zoom, sourceW, sourceH, scene.crop);

  ctx.save();
  roundRectPath(ctx, rect, radius);
  ctx.clip();
  ctx.drawImage(
    video,
    crop.x,
    crop.y,
    crop.w,
    crop.h,
    rect.x,
    rect.y,
    rect.w,
    rect.h,
  );
  ctx.restore();

  if (scene.cursor) {
    drawCursorLayer(ctx, scene.cursor, time, crop, rect, size, radius);
  }

  // Above the click ripples — an annotation is the deliberate mark, and it
  // shouldn't be the thing that gets covered.
  if (scene.annotations?.length) {
    drawAnnotationLayer(ctx, scene.annotations, time, crop, rect, size, radius);
  }

  if (scene.camera && cam) {
    drawCameraBubble(ctx, cam, scene.camera.layout, rect);
  }
}
