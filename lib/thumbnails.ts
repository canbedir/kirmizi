"use client";

function seek(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      resolve();
    };
    video.addEventListener("seeked", onSeeked);
    video.currentTime = time;
  });
}

/**
 * Grab `count` evenly spaced frames from the recording as JPEG data URLs, for a
 * filmstrip under the timeline. Runs on an offscreen video + canvas.
 */
export async function generateThumbnails(
  url: string,
  duration: number,
  count: number,
): Promise<string[]> {
  if (typeof document === "undefined" || duration <= 0) return [];

  const video = document.createElement("video");
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";

  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject(new Error("thumbnail load failed"));
  });

  const width = 240;
  const ratio =
    video.videoWidth && video.videoHeight
      ? video.videoHeight / video.videoWidth
      : 9 / 16;
  const height = Math.round(width * ratio);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return [];

  const frames: string[] = [];
  for (let i = 0; i < count; i++) {
    const time = ((i + 0.5) / count) * duration;
    try {
      await seek(video, Math.min(time, Math.max(0, duration - 0.05)));
      ctx.drawImage(video, 0, 0, width, height);
      frames.push(canvas.toDataURL("image/jpeg", 0.72));
    } catch {
      frames.push("");
    }
  }

  video.removeAttribute("src");
  video.load();
  return frames;
}
