"use client";

// Canvas renderer for the scene: paints one styled frame (background, padded
// video with rounded corners and shadow, zoom crop) from a playing <video>
// element. Used by the export pipeline; the editor previews the same model
// with CSS. Fully client-side.

import {
  backgroundById,
  cameraGeometry,
  cropRect,
  radiusPx,
  videoRect,
  zoomStateAt,
  type FrameStyle,
  type Rect,
  type ZoomRegion,
} from "@/lib/scene";
import type { CameraLayout } from "@/lib/camera-layout";
import {
  cursorAt,
  ripplesAt,
  type CursorPath,
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
  /** Smoothed path, prebuilt so every frame is a cheap lookup. */
  path: CursorPath | null;
  style: CursorStyle;
}

export interface Scene {
  style: FrameStyle;
  zooms: ZoomRegion[];
  /** Present when a webcam bubble should be composited over the video. */
  camera?: SceneCamera | null;
  /** Present when a synthetic cursor should be drawn over the video. */
  cursor?: SceneCursor | null;
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  radius: number,
) {
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

/** The classic arrow, traced in a unit box: height 1, tip at the origin. */
const ARROW: readonly [number, number][] = [
  [0, 0],
  [0, 0.75],
  [0.19, 0.58],
  [0.31, 0.85],
  [0.42, 0.8],
  [0.3, 0.53],
  [0.53, 0.53],
];

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

function drawPointer(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  height: number,
) {
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < ARROW.length; i++) {
    const px = x + ARROW[i][0] * height;
    const py = y + ARROW[i][1] * height;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();

  // A soft drop shadow lifts the pointer off busy screen content.
  ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
  ctx.shadowBlur = height * 0.18;
  ctx.shadowOffsetY = height * 0.05;
  ctx.fillStyle = "#ffffff";
  ctx.fill();

  ctx.shadowColor = "transparent";
  ctx.lineWidth = Math.max(1, height * 0.05);
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(20, 18, 16, 0.85)";
  ctx.stroke();
  ctx.restore();
}

function drawRipple(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  base: number,
  progress: number,
  secondary: boolean,
) {
  const eased = 1 - Math.pow(1 - progress, 3);
  const radius = base * (0.3 + 0.7 * eased);
  const fade = Math.pow(1 - progress, 1.5);
  const color = secondary ? RED : "#ffffff";

  ctx.save();
  // Filled core that pops on impact and vanishes quickly.
  ctx.globalAlpha = Math.pow(1 - progress, 3) * 0.28;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  // Expanding ring.
  ctx.globalAlpha = fade * 0.9;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(1, base * 0.14 * fade + base * 0.04);
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.restore();
}

/**
 * Draw the smoothed pointer and any live click ripples over the video area.
 * Shared by the export renderer and the editor's preview overlay so both
 * show exactly the same thing. The pointer keeps a constant on-screen size
 * regardless of zoom — scaling it with the crop would make it balloon.
 */
export function drawCursorLayer(
  ctx: CanvasRenderingContext2D,
  cursor: SceneCursor,
  time: number,
  crop: Rect,
  rect: Rect,
  frameW: number,
  frameH: number,
  radius = 0,
) {
  const { track, path, style } = cursor;
  // Ripples stand on their own: they mark clicks, which the captured pointer
  // never shows. They don't depend on us redrawing the pointer.
  if (!style.show && !style.clicks) return;

  ctx.save();
  roundRectPath(ctx, rect, radius);
  ctx.clip();

  const pointerH = style.size * frameH;
  if (style.clicks) {
    for (const ripple of ripplesAt(track, time)) {
      const p = mapPoint(ripple.x, ripple.y, crop, rect, frameW, frameH);
      drawRipple(
        ctx,
        p.x,
        p.y,
        pointerH * 1.5,
        ripple.progress,
        ripple.secondary,
      );
    }
  }

  if (style.show && path) {
    const at = cursorAt(path, time);
    if (at) {
      const p = mapPoint(at.x, at.y, crop, rect, frameW, frameH);
      drawPointer(ctx, p.x, p.y, pointerH);
    }
  }
  ctx.restore();
}

/** Draw the webcam bubble (cover-cropped, clipped, mirrored, bordered). */
function drawCameraBubble(
  ctx: CanvasRenderingContext2D,
  camVideo: HTMLVideoElement,
  layout: CameraLayout,
  rect: Rect,
) {
  const { cx, cy, d, radius, borderW } = cameraGeometry(layout, rect);
  const half = d / 2;
  const cw = camVideo.videoWidth || 1;
  const ch = camVideo.videoHeight || 1;
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
  ctx.drawImage(camVideo, sx, sy, side, side, cx - half, cy - half, d, d);
  ctx.restore();

  if (borderW > 0 && layout.borderColor) {
    path();
    ctx.lineWidth = borderW;
    ctx.strokeStyle = layout.borderColor;
    ctx.stroke();
  }
}

/**
 * Draw the scene for the current `video` frame at `time` (source seconds)
 * onto a canvas of the video's own dimensions. The webcam element (when the
 * scene has one) is drawn on top, unaffected by the zoom crop.
 */
export function drawSceneFrame(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  scene: Scene,
  frameW: number,
  frameH: number,
  time: number,
  camVideo?: HTMLVideoElement | null,
) {
  const bg = backgroundById(scene.style.background);
  const styled = bg.id !== "none";

  // Background. With the "none" preset the video covers the whole frame, but
  // paint black anyway so ramp frames never show garbage.
  if (styled) {
    bg.paint(ctx, frameW, frameH);
  } else {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, frameW, frameH);
  }

  const rect = styled
    ? videoRect(frameW, frameH, scene.style.padding)
    : { x: 0, y: 0, w: frameW, h: frameH };
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
  const crop = cropRect(zoom, frameW, frameH);

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
    drawCursorLayer(ctx, scene.cursor, time, crop, rect, frameW, frameH, radius);
  }

  if (scene.camera && camVideo && camVideo.readyState >= 2) {
    drawCameraBubble(ctx, camVideo, scene.camera.layout, rect);
  }
}
