"use client";

export type CameraShape = "circle" | "rounded";

export interface CameraLayout {
  /** Bubble centre X, 0..1 of the frame width. */
  x: number;
  /** Bubble centre Y, 0..1 of the frame height. */
  y: number;
  /** Bubble diameter as a fraction of the frame height. */
  size: number;
  shape: CameraShape;
  mirror: boolean;
  /** Border colour, or null for no border. */
  borderColor: string | null;
  /** Border width as a fraction of the frame height. */
  borderWidth: number;
}

export interface CameraComposite {
  stream: MediaStream;
  stop: () => void;
}

export const DEFAULT_CAMERA_LAYOUT: CameraLayout = {
  x: 0.84,
  y: 0.8,
  size: 0.22,
  shape: "circle",
  mirror: true,
  borderColor: null,
  borderWidth: 0.006,
};

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

function whenReady(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve) => {
    if (video.readyState >= 1) resolve();
    else video.onloadedmetadata = () => resolve();
  });
}

/**
 * Composite the screen with a fully configurable webcam bubble onto a canvas and
 * expose the canvas as a MediaStream for recording. Position, size, shape,
 * mirror, and border are all caller-controlled. Fully client-side.
 */
export async function composeCameraPip(
  screen: MediaStream,
  cam: MediaStream,
  layout: CameraLayout = DEFAULT_CAMERA_LAYOUT,
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

  const diameter = Math.round(height * clamp(layout.size, 0.08, 0.5));
  const half = diameter / 2;
  const cx = clamp(layout.x * width, half, width - half);
  const cy = clamp(layout.y * height, half, height - half);
  const radius = layout.shape === "circle" ? half : Math.round(diameter * 0.2);
  const borderW = layout.borderColor
    ? Math.max(1, Math.round(height * layout.borderWidth))
    : 0;

  const pathBox = () => {
    ctx.beginPath();
    if (layout.shape === "circle") ctx.arc(cx, cy, half, 0, Math.PI * 2);
    else ctx.roundRect(cx - half, cy - half, diameter, diameter, radius);
  };

  const draw = () => {
    ctx.drawImage(screenVideo, 0, 0, width, height);

    const cw = camVideo.videoWidth || 1;
    const ch = camVideo.videoHeight || 1;
    const side = Math.min(cw, ch);
    const sx = (cw - side) / 2;
    const sy = (ch - side) / 2;

    ctx.save();
    pathBox();
    ctx.clip();
    if (layout.mirror) {
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(
        camVideo,
        sx,
        sy,
        side,
        side,
        width - (cx - half) - diameter,
        cy - half,
        diameter,
        diameter,
      );
    } else {
      ctx.drawImage(
        camVideo,
        sx,
        sy,
        side,
        side,
        cx - half,
        cy - half,
        diameter,
        diameter,
      );
    }
    ctx.restore();

    if (borderW > 0 && layout.borderColor) {
      pathBox();
      ctx.lineWidth = borderW;
      ctx.strokeStyle = layout.borderColor;
      ctx.stroke();
    }
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
