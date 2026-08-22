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
  /** Range of per-tab zoom factors seen while collecting (diagnostic). */
  zoomRange?: [number, number];
  /**
   * Which coordinate space positions were normalised in (diagnostic).
   * "window-surface" is a captured window measured against itself;
   * "window" is window geometry used to reconstruct a position on a screen.
   */
  space?:
    | "viewport"
    | "window-surface"
    | "window"
    | "display"
    | "page-metrics";
  /** The OS display bounds used, when space is "display" (diagnostic). */
  displayBounds?: {
    left: number;
    top: number;
    width: number;
    height: number;
    primary?: boolean;
  };
}

// Note on what this deliberately does *not* do: redraw the pointer.
//
// No browser will leave the system cursor out of a screen capture, so a
// redrawn pointer is always a second one alongside the real thing. Covering
// the original — with a colour patch, or even with correctly restored pixels
// — trades one artifact for another, and drawing our own arrow at click time
// fails too, because a click usually lands on a button where the real cursor
// is a hand, not an arrow.
//
// So the pointer is left exactly as captured, and the polish goes into the
// moment of the click instead. That's the same conclusion every browser-based
// tool reaches, and it holds up: nothing here can ever be misaligned with
// what the viewer sees, because it's anchored to the click itself.

export interface CursorStyle {
  /** Mark each click with an impact effect. */
  clicks: boolean;
  /** Effect size as a fraction of the frame height. */
  size: number;
  /** Mix a synthesised click into the audio at each click. */
  sound: boolean;
  /** Build zoom regions from the recorded clicks, without being asked. */
  autoZoom: boolean;
}

export const DEFAULT_CURSOR_STYLE: CursorStyle = {
  clicks: true,
  size: 0.038,
  sound: false,
  autoZoom: true,
};

export function hasCursorData(track: CursorTrack | null | undefined): boolean {
  return !!track && track.samples.length > 1;
}

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

/* ---------------------------------------------------------------- */
/* Click effects                                                     */
/* ---------------------------------------------------------------- */

/** How long a click effect stays on screen, seconds. */
export const CLICK_LIFE = 0.55;

export interface ClickEffect {
  x: number;
  y: number;
  /** 0 → the instant of the click, 1 → fully faded. */
  progress: number;
  secondary: boolean;
}

/** Click effects still playing at `time` (seconds). */
export function clickEffectsAt(
  track: CursorTrack,
  time: number,
): ClickEffect[] {
  const out: ClickEffect[] = [];
  for (const click of track.clicks) {
    const age = time - click.t / 1000;
    if (age < 0 || age > CLICK_LIFE) continue;
    out.push({
      x: click.x,
      y: click.y,
      progress: age / CLICK_LIFE,
      secondary: click.button === 2,
    });
  }
  return out;
}

/* ---------------------------------------------------------------- */
/* Auto zoom                                                         */
/* ---------------------------------------------------------------- */

/** Clicks further apart in time than this start a new zoom. */
const CLUSTER_GAP = 2.5;
/**
 * And further apart on screen than this, too. Clicking a menu and then
 * something across the page is two moments however quickly it happened —
 * grouping them by timing alone produces one wide, weak zoom that just sits
 * there through both.
 */
const CLUSTER_BOX = 0.18;
/** Breathing room left between consecutive zooms, so each one lets go. */
const MIN_PULLOUT = 0.45;
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
/**
 * Merging is only worth it while the combined framing still earns its keep.
 * Two anchors at opposite corners fit in one shot, but only at a
 * magnification so slight it may as well not be there — better to zoom each
 * properly and let the travel between them be the pull-out.
 */
const MERGE_MIN_SCALE = 1.5;
/** Zooms shorter than this aren't worth the movement. */
const MIN_USEFUL = 0.9;
/** Leave the first and last moments alone so the clip opens and closes flat. */
const EDGE_GUARD = 0.35;
/**
 * How small a box the pointer must stay inside to count as settled. Keep it
 * tight: a loose box lets a dwell swallow the tail of the travel that led
 * into it, which drags neighbouring regions together.
 */
const DWELL_BOX = 0.05;
/** And for how long. */
const MIN_DWELL = 1.5;
/** Breathing room either side of a dwell. */
const DWELL_PAD = 0.3;
/** A resting pointer earns a gentler push-in than a click does. */
const DWELL_MAX_SCALE = 1.9;

function uid(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

/** One thing worth looking at, and when. */
interface Anchor {
  start: number;
  end: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  /** Anchored by a click rather than by the pointer settling somewhere. */
  strong: boolean;
}

function boundsOf(points: { x: number; y: number }[]) {
  let minX = 1;
  let maxX = 0;
  let minY = 1;
  let maxY = 0;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, maxX, minY, maxY };
}

/**
 * Bursts of clicks, each one an anchor with a lead-in and a tail. A click
 * joins the burst in progress only if it is close to it in both time and
 * place — otherwise it starts its own, and gets its own zoom.
 */
function clickAnchors(clicks: CursorClick[]): Anchor[] {
  const sorted = [...clicks].sort((a, b) => a.t - b.t);
  const bursts: CursorClick[][] = [];
  let current: CursorClick[] = [];

  for (const click of sorted) {
    const prev = current[current.length - 1];
    let breaks = false;
    if (prev) {
      if ((click.t - prev.t) / 1000 > CLUSTER_GAP) {
        breaks = true;
      } else {
        const grown = boundsOf([...current, click]);
        breaks =
          grown.maxX - grown.minX > CLUSTER_BOX ||
          grown.maxY - grown.minY > CLUSTER_BOX;
      }
    }
    if (breaks) {
      bursts.push(current);
      current = [];
    }
    current.push(click);
  }
  if (current.length) bursts.push(current);

  return bursts.map((burst) => ({
    start: burst[0].t / 1000 - LEAD,
    end: burst[burst.length - 1].t / 1000 + TAIL,
    ...boundsOf(burst),
    strong: true,
  }));
}

/**
 * Stretches where the pointer stays put. Plenty of recordings — reading
 * through a page, talking over one spot — have almost no clicks in them, and
 * click-only zooming leaves those completely flat. Where the pointer settles
 * is the next best signal for where the viewer should be looking.
 */
function dwellAnchors(samples: CursorSample[]): Anchor[] {
  const out: Anchor[] = [];
  let i = 0;
  while (i < samples.length) {
    let j = i;
    let minX = samples[i].x;
    let maxX = samples[i].x;
    let minY = samples[i].y;
    let maxY = samples[i].y;
    // Grow while everything seen so far still fits in a small box — that
    // rules out a slow drift across the screen counting as staying put.
    while (j + 1 < samples.length) {
      const next = samples[j + 1];
      const nMinX = Math.min(minX, next.x);
      const nMaxX = Math.max(maxX, next.x);
      const nMinY = Math.min(minY, next.y);
      const nMaxY = Math.max(maxY, next.y);
      if (nMaxX - nMinX > DWELL_BOX || nMaxY - nMinY > DWELL_BOX) break;
      minX = nMinX;
      maxX = nMaxX;
      minY = nMinY;
      maxY = nMaxY;
      j++;
    }
    if ((samples[j].t - samples[i].t) / 1000 >= MIN_DWELL) {
      out.push({
        start: samples[i].t / 1000 - DWELL_PAD,
        end: samples[j].t / 1000 + DWELL_PAD,
        minX,
        maxX,
        minY,
        maxY,
        strong: false,
      });
      i = j + 1;
    } else {
      i++;
    }
  }
  return out;
}

/**
 * Build zoom regions from what the user actually did.
 *
 * Two signals feed it: bursts of clicks, and stretches where the pointer
 * settles somewhere. Anchors that sit close together are merged — pulling out
 * for half a second only to dive straight back in is the thing that makes
 * automatic zoom look automatic. Each surviving region is framed on what it
 * covers, with the magnification backed off far enough that all of it stays
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
  if (duration <= 0) return [];

  const anchors = [
    ...clickAnchors(track.clicks),
    ...dwellAnchors(track.samples),
  ].sort((a, b) => a.start - b.start);
  if (!anchors.length) return [];

  // Keep away from the very start and end so the clip opens and closes flat.
  const lo = Math.min(EDGE_GUARD, duration / 4);
  const hi = Math.max(duration - EDGE_GUARD, duration * 0.75);

  const merged: Anchor[] = [];
  for (const anchor of anchors) {
    const start = clamp(anchor.start, lo, hi);
    const end = clamp(anchor.end, lo, hi);
    if (end <= start) continue;
    const window: Anchor = { ...anchor, start, end };

    const last = merged[merged.length - 1];
    const gap = last ? window.start - last.end : Infinity;
    if (last && gap < MERGE_GAP) {
      const unionSpread = Math.max(
        Math.max(last.maxX, window.maxX) - Math.min(last.minX, window.minX),
        Math.max(last.maxY, window.maxY) - Math.min(last.minY, window.minY),
      );
      // A click somewhere new is its own moment, never absorbed into the
      // region before it — that's the difference between "zoom follows what
      // I did" and one wide frame parked over everything.
      const distance = Math.hypot(
        (window.minX + window.maxX) / 2 - (last.minX + last.maxX) / 2,
        (window.minY + window.maxY) / 2 - (last.minY + last.maxY) / 2,
      );
      const clickSomewhereNew = window.strong && distance > CLUSTER_BOX;
      // Overlapping windows are normally pushed apart rather than merged, so
      // each target gets its own push-in. Merge only when one shot could
      // frame both, or when separating them would leave nothing of either.
      const mid = (last.end + window.start) / 2;
      const cannotSeparate =
        mid - MIN_PULLOUT / 2 - last.start < MIN_USEFUL ||
        window.end - (mid + MIN_PULLOUT / 2) < MIN_USEFUL;
      const worthMerging =
        !clickSomewhereNew &&
        (unionSpread <= SPREAD_BUDGET / MERGE_MIN_SCALE || cannotSeparate);
      if (worthMerging) {
        last.end = Math.max(last.end, window.end);
        last.minX = Math.min(last.minX, window.minX);
        last.maxX = Math.max(last.maxX, window.maxX);
        last.minY = Math.min(last.minY, window.minY);
        last.maxY = Math.max(last.maxY, window.maxY);
        last.strong = last.strong || window.strong;
        continue;
      }
    }
    merged.push(window);
  }

  // Anything that survived merging but still runs into its neighbour gets
  // pushed apart, so each zoom lands, lets go, and the next one starts from
  // a flat frame rather than sliding straight across.
  for (let i = 0; i < merged.length - 1; i++) {
    const a = merged[i];
    const b = merged[i + 1];
    if (a.end + MIN_PULLOUT > b.start) {
      const mid = (a.end + b.start) / 2;
      a.end = mid - MIN_PULLOUT / 2;
      b.start = mid + MIN_PULLOUT / 2;
    }
  }

  const out: ZoomRegion[] = [];
  for (const window of merged) {
    if (window.end - window.start < Math.max(MIN_USEFUL, ZOOM_MIN_LENGTH)) {
      continue;
    }
    const spread = Math.max(
      window.maxX - window.minX,
      window.maxY - window.minY,
    );
    // A click burst earns a closer look than a resting pointer does.
    const ceiling = window.strong ? ZOOM_MAX_SCALE : DWELL_MAX_SCALE;
    const scale =
      spread > 0.001 ? clamp(SPREAD_BUDGET / spread, 1.35, ceiling) : 1.8;

    const region: ZoomRegion = {
      id: uid(),
      start: window.start,
      end: window.end,
      x: (window.minX + window.maxX) / 2,
      y: (window.minY + window.maxY) / 2,
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
