"use client";

import type { Segment } from "@/lib/use-video-editor";
import { drawSceneFrame, type Scene } from "@/lib/render-scene";
import { sceneActive } from "@/lib/scene";

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

// Ticks a callback from a Web Worker timer instead of requestAnimationFrame:
// rAF freezes in background tabs, which would freeze a canvas-driven export
// the moment the user switches away. Worker timers keep ticking.
function startTicker(onTick: () => void): () => void {
  try {
    const url = URL.createObjectURL(
      new Blob(
        [
          "let id;onmessage=e=>{if(e.data==='start'){id=setInterval(()=>postMessage(0),33)}else{clearInterval(id)}}",
        ],
        { type: "application/javascript" },
      ),
    );
    const worker = new Worker(url);
    worker.onmessage = onTick;
    worker.postMessage("start");
    return () => {
      worker.postMessage("stop");
      worker.terminate();
      URL.revokeObjectURL(url);
    };
  } catch {
    let raf = 0;
    const loop = () => {
      onTick();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }
}

/**
 * Render the kept segments back-to-back into a single recording. Video comes
 * from the element's captureStream — or, when a scene (frame style / zooms)
 * is set, from a canvas the scene renderer paints each frame onto. Audio is
 * routed through a Web Audio gain node so per-segment mute works, while
 * playbackRate handles per-segment speed. Runs in (edited) real time, fully
 * client-side.
 */
export async function exportSegments(
  url: string,
  segments: Segment[],
  mimeType: string,
  onProgress?: (fraction: number) => void,
  scene?: Scene | null,
): Promise<Blob> {
  const video = document.createElement("video") as CaptureableVideo;
  video.src = url;
  video.playsInline = true;
  video.preload = "auto";

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("Couldn't load the recording."));
  });

  const useScene =
    !!scene && (sceneActive(scene.style, scene.zooms) || !!scene.camera);

  let videoStream: MediaStream;
  let stopTicker: (() => void) | null = null;
  let camVideo: HTMLVideoElement | null = null;
  if (useScene) {
    // The webcam track plays alongside the main video and is re-synced at
    // every segment boundary; the renderer draws whatever frame it's on.
    if (scene.camera) {
      camVideo = document.createElement("video");
      camVideo.src = scene.camera.url;
      camVideo.muted = true;
      camVideo.playsInline = true;
      camVideo.preload = "auto";
      const cam = camVideo;
      const loaded = await new Promise<boolean>((resolve) => {
        cam.onloadedmetadata = () => resolve(true);
        cam.onerror = () => resolve(false);
      });
      if (!loaded) camVideo = null;
    }
    const frameW = video.videoWidth || 1280;
    const frameH = video.videoHeight || 720;
    const canvas = document.createElement("canvas");
    canvas.width = frameW;
    canvas.height = frameH;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D isn't available for the export.");
    const draw = () =>
      drawSceneFrame(
        ctx,
        video,
        scene,
        frameW,
        frameH,
        video.currentTime,
        camVideo,
      );
    stopTicker = startTicker(draw);
    draw();
    videoStream = canvas.captureStream(30);
  } else {
    const capture = captureStreamOf(video);
    if (!capture) throw new Error("This browser can't export edited clips.");
    videoStream = capture.call(video);
  }

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
    if (camVideo) {
      camVideo.playbackRate = segment.speed;
      camVideo.currentTime = Math.min(
        segment.start,
        camVideo.duration || segment.start,
      );
      camVideo.play().catch(() => {});
    }
    await playUntil(video, segment.end, (current) => {
      const within = (current - segment.start) / segment.speed;
      onProgress?.(Math.min(1, (elapsed + within) / total));
    });
    camVideo?.pause();
    elapsed += (segment.end - segment.start) / segment.speed;
  }
  recorder.stop();

  const blob = await done;
  stopTicker?.();
  if (camVideo) {
    camVideo.removeAttribute("src");
    camVideo.load();
  }
  exportStream.getTracks().forEach((track) => track.stop());
  videoStream.getTracks().forEach((track) => track.stop());
  audioCtx.close().catch(() => {});
  video.removeAttribute("src");
  video.load();
  return blob;
}
