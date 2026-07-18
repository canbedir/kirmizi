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

export interface SceneCamera {
  /** Object URL of the recorded webcam track. */
  url: string;
  layout: CameraLayout;
}

export interface Scene {
  style: FrameStyle;
  zooms: ZoomRegion[];
  /** Present when a webcam bubble should be composited over the video. */
  camera?: SceneCamera | null;
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

  if (scene.camera && camVideo && camVideo.readyState >= 2) {
    drawCameraBubble(ctx, camVideo, scene.camera.layout, rect);
  }
}
