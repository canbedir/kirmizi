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
import { DEFAULT_FRAME_STYLE, type FrameStyle, type ZoomRegion } from "@/lib/scene";
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
  cursor: CursorStyle;
  sound: SoundStyle;
  camera: { layout: CameraLayout; hidden: boolean } | null;
}

export interface EditSnapshot {
  duration: number;
  segments: Segment[];
  zooms: ZoomRegion[];
  frame: FrameStyle;
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

  const frame = isObject(value.frame) ? value.frame : {};
  const cursor = isObject(value.cursor) ? value.cursor : {};
  const sound = isObject(value.sound) ? value.sound : {};
  const camera = isObject(value.camera) ? value.camera : null;

  return {
    duration,
    segments,
    zooms: readZooms(value.zooms, duration),
    frame: { ...DEFAULT_FRAME_STYLE, ...frame },
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
    // Auto zooms are the editor's own suggestion, not the user's work.
    snapshot.zooms.every((z) => z.auto) &&
    sameStyle(snapshot.frame, defaults.frame) &&
    sameStyle(snapshot.cursor, defaults.cursor) &&
    sameStyle(snapshot.sound, defaults.sound) &&
    !snapshot.camera?.hidden
  );
}
