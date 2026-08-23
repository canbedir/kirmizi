"use client";

// Bridge to the Kırmızı companion extension.
//
// A page can't observe pointer events on surfaces it doesn't own — that's a
// deliberate browser boundary, not something to work around. The optional
// companion extension collects those events in the tab being recorded and
// hands them back here, still entirely on the device.
//
// The two sides talk over window.postMessage rather than chrome.runtime, so
// the app never needs to know the extension's ID (which differs between an
// unpacked dev install and the store build).

import type { CursorClick, CursorSample, CursorTrack } from "@/lib/cursor-track";

const APP = "kirmizi-app";
const EXT = "kirmizi-companion";

/**
 * One pointer observation, as reported by the extension.
 *
 * Nearly all of it is optional, because an install in the wild can predate
 * any given field. Which install is deliberately not spelled out: the
 * manifest's version numbers releases to the store rather than commits, and
 * has been rolled back before now to keep the published sequence tidy, so a
 * number cited here would describe a build nobody ever had. What each field
 * is, and what to do when it's missing, is the part that stays true.
 */
export interface RawPointerEvent {
  /** Date.now() when it happened. */
  t: number;
  /** Position within the tab's viewport, 0..1 (top frame only). */
  vx?: number;
  vy?: number;
  /** Raw screen position, device-independent pixels. */
  screenX?: number;
  screenY?: number;
  /** Genuine top-frame client coordinates, and the viewport holding them. */
  cx?: number;
  cy?: number;
  iw?: number;
  ih?: number;
  /** The tab's window bounds, from the browser itself. */
  win?: {
    left: number;
    top: number;
    width: number;
    height: number;
    state?: string;
  };
  /** The reporting page's screen metrics, CSS pixels. */
  sw?: number;
  sh?: number;
  al?: number;
  at?: number;
  /** The reporting tab's zoom factor, attached by the background. */
  zoom?: number;
  /**
   * Pre-normalised screen fractions, from the first companion there was.
   * Wrong whenever the page wasn't at 100% zoom — kept only so an install
   * that old keeps limping instead of breaking.
   */
  sx?: number;
  sy?: number;
  /** Mouse button, only present for clicks. */
  click?: number;
}

/** One display's bounds, from the OS via chrome.system.display — the same
 * coordinate space event.screenX/screenY live in. */
export interface DisplayBounds {
  left: number;
  top: number;
  width: number;
  height: number;
  primary?: boolean;
}

interface ExtMessage {
  source: typeof EXT;
  type: "ready" | "started" | "events" | "error";
  requestId?: number;
  version?: string;
  events?: RawPointerEvent[];
  displays?: DisplayBounds[] | null;
  message?: string;
}

function isExtMessage(data: unknown): data is ExtMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { source?: unknown }).source === EXT
  );
}

let requestSeq = 0;

/** Post a message to the extension and wait for its matching reply. */
function ask<T extends ExtMessage["type"]>(
  type: string,
  reply: T,
  payload: Record<string, unknown> = {},
  timeoutMs = 1500,
): Promise<ExtMessage | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  const requestId = ++requestSeq;
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      resolve(null);
    }, timeoutMs);

    function onMessage(event: MessageEvent) {
      if (event.source !== window || !isExtMessage(event.data)) return;
      const msg = event.data;
      if (msg.type !== reply || msg.requestId !== requestId) return;
      window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      resolve(msg);
    }

    window.addEventListener("message", onMessage);
    window.postMessage({ source: APP, type, requestId, ...payload }, "*");
  });
}

/** Whether the companion extension is installed and answering. */
export async function companionAvailable(): Promise<boolean> {
  const reply = await ask("ping", "ready", {}, 400);
  return !!reply;
}

/** Begin collecting pointer events. `startedAt` is a Date.now() reference. */
export async function companionStart(startedAt: number): Promise<boolean> {
  const reply = await ask("start", "started", { startedAt });
  return !!reply;
}

/**
 * Stop collecting and return everything captured.
 *
 * Retried once: the extension's background is a service worker the browser
 * is free to shut down, and a cold start can miss the first request.
 */
export async function companionStop(): Promise<{
  events: RawPointerEvent[];
  displays: DisplayBounds[] | null;
}> {
  let reply = await ask("stop", "events", {}, 1800);
  if (!reply) reply = await ask("stop", "events", {}, 1800);
  return { events: reply?.events ?? [], displays: reply?.displays ?? null };
}

/* ---------------------------------------------------------------- */
/* Building a track                                                  */
/* ---------------------------------------------------------------- */

/** Windows of wall-clock time that were paused and so aren't in the video. */
export interface PauseWindow {
  start: number;
  end: number;
}

export interface TrackBuildOptions {
  /** Date.now() when recording began. */
  startedAt: number;
  /** Paused stretches to subtract, in wall-clock ms. */
  pauses: PauseWindow[];
  /** What was captured, from the video track's settings. */
  displaySurface?: string;
  /** Display bounds from the OS, if the companion could supply them. */
  displays?: DisplayBounds[] | null;
  /**
   * The captured frame's own size. A window capture can only be recognised by
   * its shape, so without this a window's pointer data isn't trusted at all.
   */
  capture?: { width: number; height: number } | null;
}

/** How far a surface's shape may sit from the capture's and still be it. */
const SHAPE_TOLERANCE = 0.02;

/**
 * How much of the pointer has to be on one screen to call it the recorded one.
 *
 * People work on the screen they are recording, so the pointer being almost
 * entirely on one of them is strong evidence. Set high because the cost of
 * being wrong is a zoom into the wrong monitor's worth of nothing.
 */
const SCREEN_MAJORITY = 0.8;

/**
 * How far past the frame's edge a position may sit and still be counted as on
 * it — rounding, display scaling and window borders the browser draws but
 * doesn't report all cost a pixel or two at the very edge.
 */
const EDGE_MARGIN = 0.02;

/** Whether a rectangle has the captured frame's proportions. */
function shapeMatches(
  width: number,
  height: number,
  capture: { width: number; height: number } | null | undefined,
): boolean {
  if (width <= 0 || height <= 0) return false;
  if (!capture || capture.width <= 0 || capture.height <= 0) return false;
  const captured = capture.width / capture.height;
  return Math.abs(width / height - captured) <= captured * SHAPE_TOLERANCE;
}

/**
 * Where a click landed inside its own window, as fractions of that window.
 *
 * Built from the parts no page can lie about: the window's real bounds (from
 * the browser, beyond any anti-fingerprinting), the genuine in-page position,
 * and the tab's zoom. The chrome above the viewport falls out of the window
 * height minus the viewport height, and the side borders likewise — so this
 * needs to know nothing about the browser's own furniture.
 */
function inWindow(event: RawPointerEvent): { x: number; y: number } | null {
  const win = event.win;
  if (!win || win.width <= 0 || win.height <= 0) return null;
  if (event.cx === undefined || event.cy === undefined || !event.iw) return null;
  const zoom = event.zoom || 1;
  const border = Math.max(0, (win.width - event.iw * zoom) / 2);
  const chromeTop = Math.max(0, win.height - (event.ih ?? 0) * zoom - border);
  return {
    x: (border + event.cx * zoom) / win.width,
    y: (chromeTop + event.cy * zoom) / win.height,
  };
}

/**
 * Whether this event's window is plausibly the one being recorded.
 *
 * getDisplayMedia never says which window was picked, so the only thing left
 * to match on is shape: the capture *is* that window, so it carries the
 * window's proportions whatever display scaling does to its pixel size.
 * Events from a differently shaped window are dropped rather than guessed at.
 *
 * What this can't separate is two windows of the same shape — a click in a
 * second window sized like the recorded one is indistinguishable from one
 * inside it. That's the price of the browser not naming the surface, and it
 * costs a zoom in the wrong place rather than anything worse.
 */
function windowIsCaptured(
  win: RawPointerEvent["win"],
  capture: { width: number; height: number } | null | undefined,
): boolean {
  return !!win && shapeMatches(win.width, win.height, capture);
}

/**
 * Where this event was on the desktop, in the space display bounds use.
 *
 * Preferring the reconstruction over the page's own screenX for the same
 * reason the normalising below does: a window's real bounds plus a genuine
 * in-page position survive anti-fingerprinting, and a reported screenX
 * doesn't always. The raw figure is the fallback for events without one.
 */
function onScreen(event: RawPointerEvent): { x: number; y: number } | null {
  const win = event.win;
  if (event.cx !== undefined && win && win.width > 0 && event.iw) {
    const zoom = event.zoom || 1;
    const border = Math.max(0, (win.width - event.iw * zoom) / 2);
    const chromeTop = Math.max(0, win.height - (event.ih ?? 0) * zoom - border);
    return {
      x: win.left + border + event.cx * zoom,
      y: win.top + chromeTop + (event.cy ?? 0) * zoom,
    };
  }
  if (event.screenX !== undefined) {
    return { x: event.screenX, y: event.screenY ?? 0 };
  }
  return null;
}

function contains(
  display: DisplayBounds,
  point: { x: number; y: number },
): boolean {
  return (
    point.x >= display.left &&
    point.x < display.left + display.width &&
    point.y >= display.top &&
    point.y < display.top + display.height
  );
}

/**
 * Which screen the recording is of, or nothing if it can't be settled.
 *
 * A whole-screen capture is measured against one display's bounds, and with
 * several attached nothing in the stream says which. Two independent signals
 * are made to agree instead — the same standard the dead-air cut is held to.
 *
 * Shape narrows the field: the capture has the recorded screen's proportions,
 * so a display shaped otherwise is out. That alone rarely decides it, since
 * two 16:9 monitors are the ordinary case, so the pointer settles the rest:
 * whichever surviving display it spent the recording on is the one being
 * watched. Short of a clear majority they disagree, and disagreement means
 * no cursor track rather than a guess.
 */
function chooseDisplay(
  events: RawPointerEvent[],
  displays: DisplayBounds[] | null | undefined,
  capture: { width: number; height: number } | null | undefined,
): DisplayBounds | null {
  if (!displays || displays.length === 0) return null;
  // One screen is the screen; there was never anything to choose between.
  if (displays.length === 1) return displays[0];

  const shaped = displays.filter((d) => shapeMatches(d.width, d.height, capture));
  if (shaped.length === 0) return null;
  if (shaped.length === 1) return shaped[0];

  const seen = new Map<DisplayBounds, number>();
  let placed = 0;
  for (const event of events) {
    const point = onScreen(event);
    if (!point) continue;
    placed++;
    const hit = shaped.find((d) => contains(d, point));
    if (hit) seen.set(hit, (seen.get(hit) ?? 0) + 1);
  }
  if (placed === 0) return null;

  let best: DisplayBounds | null = null;
  let bestCount = 0;
  for (const [display, count] of seen) {
    if (count > bestCount) {
      best = display;
      bestCount = count;
    }
  }
  return best && bestCount / placed >= SCREEN_MAJORITY ? best : null;
}

/**
 * Convert raw events into a cursor track on the recording's own clock.
 *
 * Two corrections matter here. Pauses are cut out of the video but not out of
 * wall-clock time, so timestamps are shifted by however much pausing happened
 * before them. And which coordinate space is right depends on what was
 * captured: a tab fills the frame with the viewport, a window with itself, a
 * monitor with the whole screen.
 */
export function buildCursorTrack(
  events: RawPointerEvent[],
  options: TrackBuildOptions,
): CursorTrack {
  const { startedAt, pauses, displaySurface, displays, capture } = options;
  const useViewport = displaySurface === "browser";
  const useWindow = displaySurface === "window";

  // The display we normalise against: the OS's own bounds, in the very
  // coordinate space event.screenX is measured in. Pages have proven unable
  // to report their screen honestly — zoom, fingerprint shielding, and scaled
  // desktops all distort screen.width — so the page's metrics are only a
  // fallback for an outdated companion.
  const display = chooseDisplay(events, displays, capture);

  // Bounds were offered but none could be matched to the capture. That's an
  // unsettled question rather than licence to fall back to the page's own
  // metrics, which are wronger still on the multi-screen desktop that got us
  // here — so the whole track is given up instead.
  const unsettled =
    !useViewport && !useWindow && !!displays?.length && !display;

  const samples: CursorSample[] = [];
  const clicks: CursorClick[] = [];

  let zoomMin = Infinity;
  let zoomMax = -Infinity;
  let usedWindowGeometry = false;

  for (const event of unsettled ? [] : events) {
    if (pauses.some((p) => event.t >= p.start && event.t <= p.end)) continue;
    let paused = 0;
    for (const p of pauses) {
      if (p.end <= event.t) paused += p.end - p.start;
    }
    const t = event.t - startedAt - paused;
    if (t < -250) continue;

    let x: number | undefined;
    let y: number | undefined;
    if (useViewport) {
      x = event.vx;
      y = event.vy;
    } else if (useWindow) {
      // A window capture is the window, so the window's own coordinates are
      // the frame's. Nothing about the screen enters into it — which is also
      // why this holds up across several monitors, where normalising against
      // one display's bounds can't.
      const placed = windowIsCaptured(event.win, capture)
        ? inWindow(event)
        : null;
      if (placed) {
        x = placed.x;
        y = placed.y;
      }
    } else if (
      event.cx !== undefined &&
      event.win &&
      event.win.width > 0 &&
      event.iw &&
      display &&
      display.width > 0
    ) {
      // Reconstruct the true screen position from parts no page can lie
      // about: the window's real bounds (from the browser, beyond any
      // anti-fingerprinting), the genuine in-page click position, and the
      // tab's zoom. The browser chrome's height falls out of the window
      // height minus the viewport height; side borders likewise.
      const zoom = event.zoom || 1;
      const border = Math.max(
        0,
        (event.win.width - event.iw * zoom) / 2,
      );
      const chromeTop = Math.max(
        0,
        event.win.height - (event.ih ?? 0) * zoom - border,
      );
      const screenX = event.win.left + border + event.cx * zoom;
      const screenY = event.win.top + chromeTop + event.cy! * zoom;
      x = (screenX - display.left) / display.width;
      y = (screenY - display.top) / display.height;
      usedWindowGeometry = true;
    } else if (event.screenX !== undefined && display && display.width > 0) {
      // Page-reported screen position against OS bounds — right in Chrome
      // and Edge, wrong in Brave, whose shields spoof screenX/screenY.
      x = (event.screenX - display.left) / display.width;
      y = ((event.screenY ?? 0) - display.top) / display.height;
    } else if (event.screenX !== undefined && event.sw) {
      // No display info — page metrics, zoom-corrected.
      const zoom = event.zoom || 1;
      zoomMin = Math.min(zoomMin, zoom);
      zoomMax = Math.max(zoomMax, zoom);
      const w = event.sw * zoom;
      const h = (event.sh ?? 0) * zoom;
      x = (event.screenX - (event.al ?? 0) * zoom) / (w || 1);
      y = ((event.screenY ?? 0) - (event.at ?? 0) * zoom) / (h || 1);
    } else {
      // The first companion — already (possibly wrongly) normalised.
      x = event.sx;
      y = event.sy;
    }
    if (
      x === undefined ||
      y === undefined ||
      !Number.isFinite(x) ||
      !Number.isFinite(y)
    ) {
      continue;
    }
    // A position off the captured surface is not a position on it. The
    // pointer leaves — onto the second monitor, outside the recorded window
    // — and what it does there isn't in the video and can't be marked or
    // zoomed into. The margin forgives an edge click that rounding, or a
    // window border the browser doesn't draw, pushes a hair past the end.
    if (x < -EDGE_MARGIN || x > 1 + EDGE_MARGIN) continue;
    if (y < -EDGE_MARGIN || y > 1 + EDGE_MARGIN) continue;
    x = Math.min(1, Math.max(0, x));
    y = Math.min(1, Math.max(0, y));
    const at = Math.max(0, t);

    samples.push({ t: at, x, y });
    if (event.click !== undefined) {
      clicks.push({ t: at, x, y, button: event.click });
    }
  }

  samples.sort((a, b) => a.t - b.t);
  clicks.sort((a, b) => a.t - b.t);
  const track: CursorTrack = { samples, clicks };
  if (Number.isFinite(zoomMin)) track.zoomRange = [zoomMin, zoomMax];
  track.space = useViewport
    ? "viewport"
    : useWindow
      ? "window-surface"
      : usedWindowGeometry
        ? "window"
        : display
          ? "display"
          : "page-metrics";
  if (display) track.displayBounds = { ...display };
  return track;
}

/**
 * Whether pointer coordinates can be matched to what was captured.
 *
 * A tab is exact: the capture *is* the viewport, so clientX/innerWidth lands
 * on the pixel. A single screen is exact too — display scaling cancels out
 * once both sides are normalised.
 *
 * A window is measured against itself, which needs no screen at all. A screen
 * is measured against its own bounds, which on a desktop spanning several of
 * them means working out which — and neither question can be settled until
 * the events are in.
 *
 * So this decides only whether there's a coordinate space worth collecting
 * for at all. Whether what arrives can actually be placed is buildCursorTrack's
 * to answer, and it gives up the track rather than guess.
 */
export function surfaceSupportsCursor(displaySurface?: string): boolean {
  return (
    displaySurface === "browser" ||
    displaySurface === "window" ||
    displaySurface === "monitor"
  );
}
