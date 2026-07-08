"use client";

import type { Segment } from "@/lib/use-video-editor";

type CaptureableVideo = HTMLVideoElement & {
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
};

function captureStreamOf(video: CaptureableVideo): (() => MediaStream) | null {
  return video.captureStream ?? video.mozCaptureStream ?? null;
}

/** Whether this browser can re-encode edited clips via captureStream. */
export function canExportVideo(): boolean {
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

function playUntil(
  video: HTMLVideoElement,
  end: number,
  onTick: (current: number) => void,
): Promise<void> {
  return new Promise((resolve) => {
    const cleanup = () => {
      video.removeEventListener("timeupdate", tick);
      video.removeEventListener("ended", onEnded);
      video.pause();
    };
    const finish = () => {
      cleanup();
      resolve();
    };
    const tick = () => {
      onTick(video.currentTime);
      if (video.currentTime >= end - 0.02) finish();
    };
    const onEnded = () => finish();
    video.addEventListener("timeupdate", tick);
    video.addEventListener("ended", onEnded);
    video.play().catch(finish);
  });
}

/**
 * Render the kept segments back-to-back into a single recording. Video comes
 * from the element's captureStream; audio is routed through a Web Audio gain
 * node so per-segment mute works, while playbackRate handles per-segment speed.
 * Runs in (edited) real time, fully client-side.
 */
export async function exportSegments(
  url: string,
  segments: Segment[],
  mimeType: string,
  onProgress?: (fraction: number) => void,
): Promise<Blob> {
  const video = document.createElement("video") as CaptureableVideo;
  video.src = url;
  video.playsInline = true;
  video.preload = "auto";

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("Couldn't load the recording."));
  });

  const capture = captureStreamOf(video);
  if (!capture) throw new Error("This browser can't export edited clips.");

  const AudioCtx: typeof AudioContext =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const audioCtx = new AudioCtx();
  await audioCtx.resume();
  const sourceNode = audioCtx.createMediaElementSource(video);
  const gain = audioCtx.createGain();
  const dest = audioCtx.createMediaStreamDestination();
  sourceNode.connect(gain);
  gain.connect(dest);

  const videoStream = capture.call(video);
  const exportStream = new MediaStream([
    ...videoStream.getVideoTracks(),
    ...dest.stream.getAudioTracks(),
  ]);

  const type = mimeType && MediaRecorder.isTypeSupported(mimeType) ? mimeType : "";
  const recorder = new MediaRecorder(
    exportStream,
    type ? { mimeType: type } : undefined,
  );
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  const done = new Promise<Blob>((resolve) => {
    recorder.onstop = () =>
      resolve(new Blob(chunks, { type: recorder.mimeType || mimeType }));
  });

  const total = segments.reduce(
    (sum, s) => sum + (s.end - s.start) / s.speed,
    0,
  );

  // Flush chunks every second so long exports stream into blob storage
  // instead of accumulating in the recorder's memory (see the capture hook).
  recorder.start(1000);
  let elapsed = 0;
  for (const segment of segments) {
    gain.gain.value = segment.muted ? 0 : 1;
    video.playbackRate = segment.speed;
    await seek(video, segment.start);
    await playUntil(video, segment.end, (current) => {
      const within = (current - segment.start) / segment.speed;
      onProgress?.(Math.min(1, (elapsed + within) / total));
    });
    elapsed += (segment.end - segment.start) / segment.speed;
  }
  recorder.stop();

  const blob = await done;
  exportStream.getTracks().forEach((track) => track.stop());
  videoStream.getTracks().forEach((track) => track.stop());
  audioCtx.close().catch(() => {});
  video.removeAttribute("src");
  video.load();
  return blob;
}
