"use client";

type CaptureableVideo = HTMLVideoElement & {
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
};

function captureStreamOf(video: CaptureableVideo): (() => MediaStream) | null {
  return video.captureStream ?? video.mozCaptureStream ?? null;
}

/** Whether this browser can re-encode a trimmed clip via captureStream. */
export function canTrimVideo(): boolean {
  if (typeof document === "undefined" || typeof MediaRecorder === "undefined") {
    return false;
  }
  const probe = document.createElement("video") as CaptureableVideo;
  return captureStreamOf(probe) !== null;
}

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
 * Trim [startSec, endSec] out of the recording by replaying that span into a
 * MediaRecorder off the element's captureStream. Fully client-side; runs in
 * real time (a 10s clip takes ~10s) and only re-encodes when actually trimming.
 */
export async function trimVideo(
  url: string,
  startSec: number,
  endSec: number,
  mimeType: string,
  onProgress?: (fraction: number) => void,
): Promise<Blob> {
  const video = document.createElement("video") as CaptureableVideo;
  video.src = url;
  video.muted = true; // allowed to autoplay; audio track still flows to capture
  video.playsInline = true;
  video.preload = "auto";

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("Couldn't load the recording."));
  });

  const capture = captureStreamOf(video);
  if (!capture) throw new Error("This browser can't export trimmed clips.");

  await seek(video, startSec);

  const stream = capture.call(video);
  const type = mimeType && MediaRecorder.isTypeSupported(mimeType) ? mimeType : "";
  const recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };

  const done = new Promise<Blob>((resolve) => {
    recorder.onstop = () =>
      resolve(new Blob(chunks, { type: recorder.mimeType || mimeType }));
  });

  const span = Math.max(0.1, endSec - startSec);
  const onTimeUpdate = () => {
    onProgress?.(Math.min(1, (video.currentTime - startSec) / span));
    if (video.currentTime >= endSec) {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.pause();
      if (recorder.state !== "inactive") recorder.stop();
    }
  };
  video.addEventListener("timeupdate", onTimeUpdate);

  recorder.start();
  await video.play();

  const blob = await done;
  stream.getTracks().forEach((track) => track.stop());
  video.removeAttribute("src");
  video.load();
  return blob;
}
