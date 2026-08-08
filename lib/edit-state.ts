"use client";

// What an edit is, once the tab has closed.
//
// The recording itself has always survived a reload; the work done to it
// hadn't. Cuts, zooms, the frame, the level — all of it lived in memory and
// went with the tab, which made the editor a place you had to finish in one
// sitting.
//
// Stored beside the recording in IndexedDB, keyed by its id, and read back
// defensively: a stored edit is data from an older version of this code, so
// anything missing or malformed falls back to the default rather than
// breaking the editor it's loaded into.

import { DEFAULT_CAMERA_LAYOUT, type CameraLayout } from "@/lib/camera-layout";
import {
  DEFAULT_CURSOR_STYLE,
  type CursorStyle,
} from "@/lib/cursor-track";
import { formatHex, parseHex } from "@/lib/color";
import {
  BACKGROUND_PRESETS,
  DEFAULT_FRAME_STYLE,
  FULL_CROP,
  MAX_STOPS,
  MIN_STOPS,
  NO_BACKGROUND,
  clampCrop,
  isFullCrop,
  type Background,
  type CropRegion,
  type FrameStyle,
  type GradientStop,
  type ZoomRegion,
} from "@/lib/scene";
import { DEFAULT_SOUND_STYLE, type SoundStyle } from "@/lib/sound";
import type { Segment } from "@/lib/use-video-editor";

/** Bumped when a stored edit could no longer be read correctly. */
const VERSION = 1;

export interface StoredEdits {
  version: number;
  savedAt: number;
  /** The clip length the cuts were made against, to spot a mismatch. */
  duration: number;
  segments: Segment[];
  zooms: ZoomRegion[];
  frame: FrameStyle;
  crop: CropRegion;
  cursor: CursorStyle;
  sound: SoundStyle;
  camera: { layout: CameraLayout; hidden: boolean } | null;
}

export interface EditSnapshot {
  duration: number;
  segments: Segment[];
  zooms: ZoomRegion[];
  frame: FrameStyle;
  crop: CropRegion;
  cursor: CursorStyle;
  sound: SoundStyle;
  camera: { layout: CameraLayout; hidden: boolean } | null;
}

export function packEdits(snapshot: EditSnapshot): StoredEdits {
  return { version: VERSION, savedAt: Date.now(), ...snapshot };
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const num = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const bool = (value: unknown, fallback: boolean): boolean =>
  typeof value === "boolean" ? value : fallback;

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

/**
 * A stored colour, normalised to a hex string — or nothing.
 *
 * This value ends up in `ctx.fillStyle` and in a CSS `background`, so it has
 * to be a colour and not merely a string: anything that isn't one is dropped
 * rather than handed on.
 */
function readColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const rgb = parseHex(value);
  return rgb ? formatHex(rgb) : null;
}

function readBackground(value: unknown): Background {
  // Edits saved before backgrounds became values stored a preset's name. The
  // presets are all still here, so those keep the background they were given.
  if (typeof value === "string") {
    return BACKGROUND_PRESETS.find((p) => p.id === value)?.value ?? NO_BACKGROUND;
  }
  if (!isObject(value)) return NO_BACKGROUND;

  if (value.kind === "solid") {
    const color = readColor(value.color);
    return color ? { kind: "solid", color } : NO_BACKGROUND;
  }

  if (value.kind === "linear" && Array.isArray(value.stops)) {
    const stops: GradientStop[] = [];
    for (const raw of value.stops) {
      if (!isObject(raw) || stops.length >= MAX_STOPS) continue;
      const color = readColor(raw.color);
      if (!color) continue;
      stops.push({ offset: clamp(num(raw.offset, stops.length), 0, 1), color });
    }
    // A gradient needs two colours to be one at all.
    if (stops.length < MIN_STOPS) return NO_BACKGROUND;
    const angle = ((Math.round(num(value.angle, 135)) % 360) + 360) % 360;
    return { kind: "linear", angle, stops };
  }

  return NO_BACKGROUND;
}

/**
 * Read a frame style back from wherever it was kept — the last-used style in
 * localStorage, or the edit filed beside a recording. Both are data written by
 * an older version of this code, so every field is checked rather than trusted.
 */
export function readFrameStyle(value: unknown): FrameStyle {
  const raw = isObject(value) ? value : {};
  return {
    background: readBackground(raw.background),
    padding: clamp(num(raw.padding, DEFAULT_FRAME_STYLE.padding), 0, 0.35),
    radius: clamp(num(raw.radius, DEFAULT_FRAME_STYLE.radius), 0, 0.3),
    shadow: clamp(num(raw.shadow, DEFAULT_FRAME_STYLE.shadow), 0, 1),
    aspect:
      typeof raw.aspect === "string" ? raw.aspect : DEFAULT_FRAME_STYLE.aspect,
  };
}

function readSegments(value: unknown, duration: number): Segment[] | null {
  if (!Array.isArray(value) || !value.length) return null;
  const out: Segment[] = [];
  for (const raw of value) {
    if (!isObject(raw)) return null;
    const start = num(raw.start, -1);
    const end = num(raw.end, -1);
    // A cut outside the clip means these edits belong to something else.
    if (start < 0 || end <= start || end > duration + 0.5) return null;
    out.push({
      id: typeof raw.id === "string" ? raw.id : Math.random().toString(36).slice(2),
      start,
      end: Math.min(end, duration),
      muted: bool(raw.muted, false),
      speed: num(raw.speed, 1),
    });
  }
  return out.sort((a, b) => a.start - b.start);
}

function readZooms(value: unknown, duration: number): ZoomRegion[] {
  if (!Array.isArray(value)) return [];
  const out: ZoomRegion[] = [];
  for (const raw of value) {
    if (!isObject(raw)) continue;
    const start = num(raw.start, -1);
    const end = num(raw.end, -1);
    if (start < 0 || end <= start || start > duration) continue;
    out.push({
      id: typeof raw.id === "string" ? raw.id : Math.random().toString(36).slice(2),
      start,
      end: Math.min(end, duration),
      x: num(raw.x, 0.5),
      y: num(raw.y, 0.5),
      scale: num(raw.scale, 1.8),
      auto: bool(raw.auto, false),
    });
  }
  return out;
}

/**
 * Read a stored edit back, against the clip it's being loaded into. Returns
 * null when there's nothing usable — the editor then starts fresh, which is
 * the same thing it did before any of this existed.
 */
export function readEdits(value: unknown, duration: number): EditSnapshot | null {
  if (!isObject(value) || value.version !== VERSION || duration <= 0) return null;

  const segments = readSegments(value.segments, duration);
  if (!segments) return null;

  const cursor = isObject(value.cursor) ? value.cursor : {};
  const sound = isObject(value.sound) ? value.sound : {};
  const camera = isObject(value.camera) ? value.camera : null;

  return {
    duration,
    segments,
    zooms: readZooms(value.zooms, duration),
    frame: readFrameStyle(value.frame),
    // A crop is only meaningful if it's a real rectangle inside the capture;
    // anything else falls back to the whole screen.
    crop: isObject(value.crop)
      ? clampCrop({
          x: num(value.crop.x, 0),
          y: num(value.crop.y, 0),
          w: num(value.crop.w, 1),
          h: num(value.crop.h, 1),
        })
      : FULL_CROP,
    cursor: { ...DEFAULT_CURSOR_STYLE, ...cursor },
    sound: { ...DEFAULT_SOUND_STYLE, ...sound },
    camera: camera
      ? {
          layout: {
            ...DEFAULT_CAMERA_LAYOUT,
            ...(isObject(camera.layout) ? camera.layout : {}),
          },
          hidden: bool(camera.hidden, false),
        }
      : null,
  };
}

/** Whether a snapshot is worth storing at all. */
export function isUntouched(snapshot: EditSnapshot, defaults: {
  frame: FrameStyle;
  cursor: CursorStyle;
  sound: SoundStyle;
}): boolean {
  const whole =
    snapshot.segments.length === 1 &&
    snapshot.segments[0].start <= 0.001 &&
    Math.abs(snapshot.segments[0].end - snapshot.duration) < 0.05 &&
    !snapshot.segments[0].muted &&
    snapshot.segments[0].speed === 1;
  const sameStyle = (a: object, b: object) =>
    JSON.stringify(a) === JSON.stringify(b);
  return (
    whole &&
    isFullCrop(snapshot.crop) &&
    // Auto zooms are the editor's own suggestion, not the user's work.
    snapshot.zooms.every((z) => z.auto) &&
    sameStyle(snapshot.frame, defaults.frame) &&
    sameStyle(snapshot.cursor, defaults.cursor) &&
    sameStyle(snapshot.sound, defaults.sound) &&
    !snapshot.camera?.hidden
  );
}
