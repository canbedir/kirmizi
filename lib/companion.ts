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

interface ExtMessage {
  source: typeof EXT;
  type: "ready" | "started" | "events" | "error";
  requestId?: number;
  version?: string;
  events?: RawPointerEvent[];
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

/** Stop collecting and return everything captured. */
export async function companionStop(): Promise<RawPointerEvent[]> {
  const reply = await ask("stop", "events", {}, 4000);
  return reply?.events ?? [];
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
}

/**
 * Convert raw events into a cursor track on the recording's own clock.
 *
 * Two corrections matter here. Pauses are cut out of the video but not out of
 * wall-clock time, so timestamps are shifted by however much pausing happened
 * before them. And which coordinate space is right depends on what was
 * captured: a tab fills the frame with the viewport, a monitor with the whole
 * screen.
 */
export function buildCursorTrack(
  events: RawPointerEvent[],
  options: TrackBuildOptions,
): CursorTrack {
  const { startedAt, pauses, displaySurface } = options;
  // Window captures don't line up with either space (we'd need the window's
  // screen offset, which isn't exposed), so those get no cursor track.
  const useViewport = displaySurface === "browser";

  const samples: CursorSample[] = [];
  const clicks: CursorClick[] = [];

  let zoomMin = Infinity;
  let zoomMax = -Infinity;

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
    } else if (event.screenX !== undefined && event.sw) {
      // Divide like with like: event.screenX is in device-independent
      // pixels, screen.width in CSS pixels — they differ by the tab's zoom
      // factor, so a zoomed page would otherwise shrink every coordinate.
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
  return track;
}

/**
 * Whether pointer coordinates can be matched to what was captured.
 *
 * A tab is exact: the capture *is* the viewport, so clientX/innerWidth lands
 * on the pixel. A single screen is exact too — display scaling cancels out
 * once both sides are normalised.
 *
 * More than one screen is where it breaks down. Coordinates are measured from
 * the whole virtual desktop, and nothing tells us which of the screens the
 * user picked, so anything drawn from them can land on the wrong part of the
 * frame — or the wrong monitor entirely. Better to collect nothing than to
 * put the zoom somewhere the user didn't click.
 */
export function surfaceSupportsCursor(displaySurface?: string): boolean {
  if (displaySurface === "browser") return true;
  if (displaySurface !== "monitor") return false;
  const extended =
    typeof screen !== "undefined" &&
    (screen as Screen & { isExtended?: boolean }).isExtended;
  return !extended;
}
