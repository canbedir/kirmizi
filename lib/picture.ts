"use client";

// Taking a picture in from the user's disk and making it something an edit can
// carry around.
//
// The file is shrunk and re-encoded rather than kept as it came: a background
// is only ever drawn behind the recording, so a 12-megapixel phone photo is
// several megabytes spent on detail nothing will ever show. Small enough to
// live inline means the whole edit stays one serialisable value — it saves,
// reloads, undoes and exports through the paths that already existed, with no
// second store to keep in step.

/** The longest edge a background is kept at. */
export const MAX_PICTURE_EDGE = 1920;

/** Refused above this, before anything is decoded. */
export const MAX_PICTURE_BYTES = 40 * 1024 * 1024;

/** What a shrunk picture may weigh once encoded, base64 included. */
const TARGET_BYTES = 900 * 1024;

/** Tried in turn until one comes in under the target. */
const QUALITIES = [0.85, 0.72, 0.6, 0.45];

export function fitWithin(
  w: number,
  h: number,
  max: number,
): { w: number; h: number } {
  if (w <= 0 || h <= 0) return { w: 0, h: 0 };
  const scale = Math.min(1, max / Math.max(w, h));
  return {
    w: Math.max(1, Math.round(w * scale)),
    h: Math.max(1, Math.round(h * scale)),
  };
}

/** Whether a stored background's picture is one we're willing to draw. */
export function isSafePictureSrc(src: unknown): src is string {
  // Only a data URL. A stored edit that named an http address would make the
  // editor fetch something the moment it opened, which is exactly what this
  // app promises never to do.
  return typeof src === "string" && /^data:image\/(png|jpeg|webp);base64,/.test(src);
}

async function decode(file: Blob): Promise<{ source: CanvasImageSource; w: number; h: number }> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    return { source: bitmap, w: bitmap.width, h: bitmap.height };
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { source: img, w: img.naturalWidth, h: img.naturalHeight };
  } finally {
    // Revoked after decode: the pixels are the browser's by then.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/**
 * Read a picture chosen from disk and hand back a data URL small enough to
 * keep inside an edit. Throws with something worth showing the user.
 */
export async function prepareBackgroundPicture(file: Blob): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("That file isn't a picture.");
  }
  if (file.size > MAX_PICTURE_BYTES) {
    throw new Error("That picture is too large to use as a background.");
  }

  const { source, w, h } = await decode(file);
  if (!w || !h) throw new Error("That picture couldn't be read.");
  const size = fitWithin(w, h, MAX_PICTURE_EDGE);

  const canvas = document.createElement("canvas");
  canvas.width = size.w;
  canvas.height = size.h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't process pictures.");
  // Black underneath, so a transparent PNG lands on something rather than
  // turning whatever the JPEG encoder felt like into the background.
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, size.w, size.h);
  ctx.drawImage(source, 0, 0, size.w, size.h);
  if ("close" in source && typeof source.close === "function") source.close();

  let out = "";
  for (const quality of QUALITIES) {
    out = canvas.toDataURL("image/jpeg", quality);
    if (out.length <= TARGET_BYTES) return out;
  }
  return out;
}

/** Decode a background's data URL for the renderer. */
export async function loadPicture(src: string): Promise<CanvasImageSource | null> {
  if (!isSafePictureSrc(src)) return null;
  try {
    const img = new Image();
    img.src = src;
    await img.decode();
    return img;
  } catch {
    return null;
  }
}
