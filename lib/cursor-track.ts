"use client";

// The cursor track: where the pointer was and when it was clicked during a
// recording. The browser can't observe pointer events on surfaces it doesn't
// own, so this data comes from the companion extension (see /extension) and
// is never derived from the pixels. With it we can redraw a smoothed cursor,
// add click effects, and propose zoom regions around what the user did.
//
// Positions are normalised (0..1) against the captured surface, so they stay
// correct whatever resolution the recording came out at.

import {
  ZOOM_MAX_SCALE,
  ZOOM_MIN_LENGTH,
  type ZoomRegion,
} from "@/lib/scene";

export interface CursorSample {
  /** Milliseconds since recording start. */
  t: number;
  x: number;
  y: number;
}

export interface CursorClick {
  /** Milliseconds since recording start. */
  t: number;
  x: number;
  y: number;
  /** 0 = primary, 2 = secondary. */
  button: number;
}

export interface CursorTrack {
  samples: CursorSample[];
  clicks: CursorClick[];
}

export interface CursorStyle {
  /**
   * Draw the synthetic pointer over the recording. Off by default: no browser
   * currently honours `getDisplayMedia({video:{cursor:"never"}})`, so the real
   * pointer is always baked into the capture and drawing ours on top shows two
   * — the smoothed one visibly trailing the other.
   */
  show: boolean;
  /** Pointer height as a fraction of the frame height. */
  size: number;
  /** Motion smoothing, 0 (raw) to 1 (very floaty). */
  smoothing: number;
  /** Draw a ripple where each click landed. */
  clicks: boolean;
  /** Mix a synthesised click into the audio at each click. */
  sound: boolean;
  /** Build zoom regions from the recorded clicks, without being asked. */
  autoZoom: boolean;
}

export const DEFAULT_CURSOR_STYLE: CursorStyle = {
  show: false,
  size: 0.05,
  smoothing: 0.55,
  clicks: true,
  sound: false,
  autoZoom: true,
};

export function hasCursorData(track: CursorTrack | null | undefined): boolean {
  return !!track && track.samples.length > 1;
}

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

/* ---------------------------------------------------------------- */
/* Smoothed path                                                     */
/* ---------------------------------------------------------------- */

/** A resampled, spring-smoothed pointer path, queryable by time. */
export interface CursorPath {
  /** Fixed timestep between points, seconds. */
  step: number;
  /** First point's time, seconds. */
  t0: number;
  xs: Float32Array;
  ys: Float32Array;
}

const PATH_HZ = 120;

/** Linear interpolation of the raw samples at `ms`. */
function rawAt(samples: CursorSample[], ms: number): { x: number; y: number } {
  if (ms <= samples[0].t) return samples[0];
  const last = samples[samples.length - 1];
  if (ms >= last.t) return last;
  // Samples are ordered, so walk with a binary search.
  let lo = 0;
  let hi = samples.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].t <= ms) lo = mid;
    else hi = mid;
  }
  const a = samples[lo];
  const b = samples[hi];
  const span = b.t - a.t;
  const k = span > 0 ? (ms - a.t) / span : 0;
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
}

/**
 * Resample the pointer at a fixed rate and run it through a critically
 * damped spring. That's what turns jittery, hand-held mouse movement into
 * the gliding cursor people associate with polished product demos.
 */
export function buildCursorPath(
  track: CursorTrack,
  smoothing: number,
): CursorPath | null {
  const samples = track.samples;
  if (samples.length < 2) return null;

  const step = 1 / PATH_HZ;
  const t0 = samples[0].t / 1000;
  const t1 = samples[samples.length - 1].t / 1000;
  const count = Math.max(2, Math.ceil((t1 - t0) / step) + 1);
  const xs = new Float32Array(count);
  const ys = new Float32Array(count);

  // Map smoothing 0..1 onto a stiffness range: high stiffness tracks the
  // raw pointer almost exactly, low stiffness glides well behind it.
  const stiffness = 420 - clamp(smoothing, 0, 1) * 380;
  const damping = 2 * Math.sqrt(stiffness);

  let px = samples[0].x;
  let py = samples[0].y;
  let vx = 0;
  let vy = 0;
  for (let i = 0; i < count; i++) {
    const target = rawAt(samples, (t0 + i * step) * 1000);
    const ax = stiffness * (target.x - px) - damping * vx;
    const ay = stiffness * (target.y - py) - damping * vy;
    vx += ax * step;
    vy += ay * step;
    px += vx * step;
    py += vy * step;
    xs[i] = px;
    ys[i] = py;
  }

  return { step, t0, xs, ys };
}

/** The smoothed pointer position at `time` (seconds), or null if off-track. */
export function cursorAt(
  path: CursorPath,
  time: number,
): { x: number; y: number } | null {
  const idx = (time - path.t0) / path.step;
  if (idx < -1 || idx > path.xs.length) return null;
  const i = clamp(Math.floor(idx), 0, path.xs.length - 1);
  const j = Math.min(i + 1, path.xs.length - 1);
  const k = clamp(idx - i, 0, 1);
  return {
    x: path.xs[i] + (path.xs[j] - path.xs[i]) * k,
    y: path.ys[i] + (path.ys[j] - path.ys[i]) * k,
  };
}

/* ---------------------------------------------------------------- */
/* Click ripples                                                     */
/* ---------------------------------------------------------------- */

/** How long a click ripple stays on screen, seconds. */
export const RIPPLE_LIFE = 0.5;

export interface Ripple {
  x: number;
  y: number;
  /** 0 → just clicked, 1 → fully faded. */
  progress: number;
  secondary: boolean;
}

/** Ripples that are still visible at `time` (seconds). */
export function ripplesAt(track: CursorTrack, time: number): Ripple[] {
  const out: Ripple[] = [];
  for (const click of track.clicks) {
    const age = time - click.t / 1000;
    if (age < 0 || age > RIPPLE_LIFE) continue;
    out.push({
      x: click.x,
      y: click.y,
      progress: age / RIPPLE_LIFE,
      secondary: click.button === 2,
    });
  }
  return out;
}

/* ---------------------------------------------------------------- */
/* Auto zoom                                                         */
/* ---------------------------------------------------------------- */

/** Clicks further apart than this start a new zoom. */
const CLUSTER_GAP = 2.5;
/** Lead-in before the first click of a cluster, and tail after the last. */
const LEAD = 0.7;
const TAIL = 1.3;
/** Fraction of the zoomed viewport a cluster's clicks may span. */
const SPREAD_BUDGET = 0.55;
/**
 * Two zooms closer than this are merged into one. Pulling out and diving
 * straight back in reads as a glitch, not as emphasis — the single most
 * important rule for making this feel deliberate rather than automatic.
 */
const MERGE_GAP = 1.6;
/** Zooms shorter than this aren't worth the movement. */
const MIN_USEFUL = 1.2;
/** Leave the first and last moments alone so the clip opens and closes flat. */
const EDGE_GUARD = 0.35;

function uid(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

/**
 * Build zoom regions from what the user actually did.
 *
 * Clicks are grouped into bursts, each burst becomes a candidate window, and
 * candidates that sit close together are merged — pulling out for half a
 * second only to dive back in is the thing that makes automatic zoom look
 * automatic. Each surviving region is then framed on the clicks it covers,
 * with the magnification backed off far enough that every one of them stays
 * inside the shot.
 *
 * Regions colliding with `existing` (hand-placed) zooms are dropped: the
 * user's own edits win.
 */
export function autoZoomRegions(
  track: CursorTrack,
  duration: number,
  existing: ZoomRegion[] = [],
): ZoomRegion[] {
  const clicks = [...track.clicks].sort((a, b) => a.t - b.t);
  if (!clicks.length || duration <= 0) return [];

  // 1. Group clicks into bursts.
  const bursts: CursorClick[][] = [];
  let current: CursorClick[] = [];
  for (const click of clicks) {
    const prev = current[current.length - 1];
    if (prev && (click.t - prev.t) / 1000 > CLUSTER_GAP) {
      bursts.push(current);
      current = [];
    }
    current.push(click);
  }
  if (current.length) bursts.push(current);

  // 2. Candidate windows, kept away from the very start and end.
  const lo = Math.min(EDGE_GUARD, duration / 4);
  const hi = Math.max(duration - EDGE_GUARD, duration * 0.75);
  interface Candidate {
    start: number;
    end: number;
    clicks: CursorClick[];
  }
  const candidates: Candidate[] = [];
  for (const burst of bursts) {
    const start = clamp(burst[0].t / 1000 - LEAD, lo, hi);
    const end = clamp(burst[burst.length - 1].t / 1000 + TAIL, lo, hi);
    if (end <= start) continue;
    candidates.push({ start, end, clicks: burst });
  }

  // 3. Merge anything that would otherwise flicker apart and back together.
  const merged: Candidate[] = [];
  for (const candidate of candidates) {
    const last = merged[merged.length - 1];
    if (last && candidate.start - last.end < MERGE_GAP) {
      last.end = Math.max(last.end, candidate.end);
      last.clicks = last.clicks.concat(candidate.clicks);
    } else {
      merged.push({ ...candidate });
    }
  }

  // 4. Frame each region on the clicks it ended up containing.
  const out: ZoomRegion[] = [];
  for (const window of merged) {
    if (window.end - window.start < Math.max(MIN_USEFUL, ZOOM_MIN_LENGTH)) {
      continue;
    }

    let minX = 1;
    let maxX = 0;
    let minY = 1;
    let maxY = 0;
    for (const c of window.clicks) {
      minX = Math.min(minX, c.x);
      maxX = Math.max(maxX, c.x);
      minY = Math.min(minY, c.y);
      maxY = Math.max(maxY, c.y);
    }
    const spread = Math.max(maxX - minX, maxY - minY);
    const scale =
      spread > 0.001 ? clamp(SPREAD_BUDGET / spread, 1.35, ZOOM_MAX_SCALE) : 2;

    const region: ZoomRegion = {
      id: uid(),
      start: window.start,
      end: window.end,
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
      scale: Math.round(scale * 10) / 10,
      auto: true,
    };

    if (existing.some((z) => region.start < z.end && z.start < region.end)) {
      continue;
    }
    out.push(region);
  }

  return out;
}
