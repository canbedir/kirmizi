"use client";

export interface CameraComposite {
  stream: MediaStream;
  stop: () => void;
}

function whenReady(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve) => {
    if (video.readyState >= 1) resolve();
    else video.onloadedmetadata = () => resolve();
  });
}

/**
 * Composite the screen with a circular webcam bubble in the bottom-right corner
 * onto a canvas, and expose the canvas as a MediaStream for recording. Fully
 * client-side; the bubble is baked into the video frames.
 */
export async function composeCameraPip(
  screen: MediaStream,
  cam: MediaStream,
): Promise<CameraComposite> {
  const screenVideo = document.createElement("video");
  screenVideo.srcObject = screen;
  screenVideo.muted = true;
  screenVideo.playsInline = true;

  const camVideo = document.createElement("video");
  camVideo.srcObject = cam;
  camVideo.muted = true;
  camVideo.playsInline = true;

  await Promise.all([whenReady(screenVideo), whenReady(camVideo)]);
  await Promise.all([
    screenVideo.play().catch(() => {}),
    camVideo.play().catch(() => {}),
  ]);

  const width = screenVideo.videoWidth || 1280;
  const height = screenVideo.videoHeight || 720;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D isn't available for the camera overlay.");

  const diameter = Math.round(height * 0.24);
  const margin = Math.round(height * 0.035);
  const cx = width - margin - diameter / 2;
  const cy = height - margin - diameter / 2;
  const ring = Math.max(2, Math.round(height * 0.005));

  const draw = () => {
    ctx.drawImage(screenVideo, 0, 0, width, height);

    // Cover-fit the camera into a square, then clip it to a circle.
    const cw = camVideo.videoWidth || 1;
    const ch = camVideo.videoHeight || 1;
    const side = Math.min(cw, ch);
    const sx = (cw - side) / 2;
    const sy = (ch - side) / 2;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, diameter / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(
      camVideo,
      sx,
      sy,
      side,
      side,
      cx - diameter / 2,
      cy - diameter / 2,
      diameter,
      diameter,
    );
    ctx.restore();

    ctx.beginPath();
    ctx.arc(cx, cy, diameter / 2, 0, Math.PI * 2);
    ctx.lineWidth = ring;
    ctx.strokeStyle = "rgba(246,45,34,0.9)";
    ctx.stroke();
  };

  // Drive the draw loop from a Web Worker timer instead of requestAnimationFrame:
  // rAF is frozen in background tabs, which would freeze the composited
  // recording the moment the user switches away. Worker timers keep ticking.
  let stopTicker: () => void;
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
    worker.onmessage = () => draw();
    worker.postMessage("start");
    stopTicker = () => {
      worker.postMessage("stop");
      worker.terminate();
      URL.revokeObjectURL(url);
    };
  } catch {
    let raf = 0;
    const loop = () => {
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    stopTicker = () => cancelAnimationFrame(raf);
  }
  draw();

  const stream = canvas.captureStream(30);
  const stop = () => {
    stopTicker();
    screenVideo.srcObject = null;
    camVideo.srcObject = null;
    stream.getTracks().forEach((track) => track.stop());
  };

  return { stream, stop };
}
