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

/** One pointer observation, as reported by the extension. */
export interface RawPointerEvent {
  /** Date.now() when it happened. */
  t: number;
  /** Position within the tab's viewport, 0..1 (top frame only). */
  vx?: number;
  vy?: number;
  /** Raw screen position, device-independent pixels (companion ≥ 1.0.2). */
  screenX?: number;
  screenY?: number;
  /** Genuine top-frame client coordinates + viewport size (≥ 1.0.4). */
  cx?: number;
  cy?: number;
  iw?: number;
  ih?: number;
  /** The tab's window bounds, from the browser itself (≥ 1.0.4). */
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
   * Pre-normalised screen fractions from companion ≤ 1.0.1. Wrong whenever
   * the page wasn't at 100% zoom — kept only so an outdated install keeps
   * limping instead of breaking.
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

/** How far a window's shape may sit from the capture's and still be it. */
const SHAPE_TOLERANCE = 0.02;

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
  if (!win || win.width <= 0 || win.height <= 0) return false;
  if (!capture || capture.width <= 0 || capture.height <= 0) return false;
  const captured = capture.width / capture.height;
  return (
    Math.abs(win.width / win.height - captured) <= captured * SHAPE_TOLERANCE
  );
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

  // The display we normalise against: the OS's own bounds for the (single)
  // screen, in the very coordinate space event.screenX is measured in. Pages
  // have proven unable to report their screen honestly — zoom, fingerprint
  // shielding, and scaled desktops all distort screen.width — so the page's
  // metrics are only a fallback for an outdated companion.
  const display =
    displays?.find((d) => d.primary) ?? displays?.[0] ?? null;

  const samples: CursorSample[] = [];
  const clicks: CursorClick[] = [];

  let zoomMin = Infinity;
  let zoomMax = -Infinity;
  let usedWindowGeometry = false;

  for (const event of events) {
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
      // No display info (companion 1.0.2) — page metrics, zoom-corrected.
      const zoom = event.zoom || 1;
      zoomMin = Math.min(zoomMin, zoom);
      zoomMax = Math.max(zoomMax, zoom);
      const w = event.sw * zoom;
      const h = (event.sh ?? 0) * zoom;
      x = (event.screenX - (event.al ?? 0) * zoom) / (w || 1);
      y = ((event.screenY ?? 0) - (event.at ?? 0) * zoom) / (h || 1);
    } else {
      // Companion ≤ 1.0.1 — already (possibly wrongly) normalised.
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
 * A window is measured against itself, which needs no screen at all, so the
 * monitors don't come into it. Whether the window we hear from is the one
 * being recorded can't be settled until the events are in, so collecting is
 * allowed here and the shape check happens in buildCursorTrack.
 *
 * More than one screen is where the whole-screen capture breaks down.
 * Coordinates are measured from the whole virtual desktop, and nothing tells
 * us which of the screens the user picked, so anything drawn from them can
 * land on the wrong part of the frame — or the wrong monitor entirely. Better
 * to collect nothing than to put the zoom somewhere the user didn't click.
 */
export function surfaceSupportsCursor(displaySurface?: string): boolean {
  if (displaySurface === "browser") return true;
  if (displaySurface === "window") return true;
  if (displaySurface !== "monitor") return false;
  const extended =
    typeof screen !== "undefined" &&
    (screen as Screen & { isExtended?: boolean }).isExtended;
  return !extended;
}
