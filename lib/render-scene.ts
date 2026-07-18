"use client";

// Canvas renderer for the scene: paints one styled frame (background, padded
// video with rounded corners and shadow, zoom crop) from a playing <video>
// element. Used by the export pipeline; the editor previews the same model
// with CSS. Fully client-side.

import {
  backgroundById,
  cropRect,
  radiusPx,
  videoRect,
  zoomStateAt,
  type FrameStyle,
  type Rect,
  type ZoomRegion,
} from "@/lib/scene";

export interface Scene {
  style: FrameStyle;
  zooms: ZoomRegion[];
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

/**
 * Draw the scene for the current `video` frame at `time` (source seconds)
 * onto a canvas of the video's own dimensions.
 */
export function drawSceneFrame(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  scene: Scene,
  frameW: number,
  frameH: number,
  time: number,
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
}
