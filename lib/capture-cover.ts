"use client";

/** Grab a single early frame from a recording as a small JPEG data URL. */
export function captureCover(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") return resolve(null);

    const video = document.createElement("video");
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";

    const finish = (result: string | null) => {
      video.removeAttribute("src");
      video.load();
      resolve(result);
    };

    const grab = () => {
      try {
        const width = 320;
        const ratio =
          video.videoWidth && video.videoHeight
            ? video.videoHeight / video.videoWidth
            : 9 / 16;
        const height = Math.round(width * ratio);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return finish(null);
        ctx.drawImage(video, 0, 0, width, height);
        finish(canvas.toDataURL("image/jpeg", 0.6));
      } catch {
        finish(null);
      }
    };

    video.onerror = () => finish(null);
    video.onloadeddata = () => {
      video.onseeked = grab;
      const target = Number.isFinite(video.duration)
        ? Math.min(0.5, video.duration / 2)
        : 0.5;
      try {
        video.currentTime = target;
      } catch {
        grab();
      }
    };
  });
}
