"use client";

// How the webcam bubble is placed and shaped. The camera is recorded as its
// own track; this layout is applied live in the HUD preview, in the editor,
// and by the canvas renderer at export — never burned in at capture time.

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

export const DEFAULT_CAMERA_LAYOUT: CameraLayout = {
  x: 0.84,
  y: 0.8,
  size: 0.22,
  shape: "circle",
  mirror: true,
  borderColor: null,
  borderWidth: 0.006,
};
