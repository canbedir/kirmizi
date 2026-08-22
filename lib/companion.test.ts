import { describe, expect, test } from "bun:test";
import {
  buildCursorTrack,
  surfaceSupportsCursor,
  type RawPointerEvent,
} from "@/lib/companion";

// What a window capture has to get right.
//
// The risk here isn't a rough position, it's a confident wrong one: a zoom
// that pushes into somewhere the user never clicked is worse than no zoom at
// all. So these pin down both halves — that a click inside the recorded
// window lands where it should, and that anything we can't place is dropped
// rather than guessed at.

const STARTED = 1_000_000;

/** A window 1200×800 at (100, 50), holding a 1184×700 viewport. */
const WINDOW = { left: 100, top: 50, width: 1200, height: 800 };

/** A click inside that window's viewport, in the viewport's own pixels. */
function clickAt(
  cx: number,
  cy: number,
  win: typeof WINDOW = WINDOW,
  zoom = 1,
): RawPointerEvent {
  return {
    t: STARTED + 1000,
    cx,
    cy,
    iw: 1184,
    ih: 700,
    win,
    zoom,
    click: 0,
  };
}

const build = (
  events: RawPointerEvent[],
  capture: { width: number; height: number } | null,
  displaySurface = "window",
) =>
  buildCursorTrack(events, {
    startedAt: STARTED,
    pauses: [],
    displaySurface,
    displays: null,
    capture,
  });

describe("window capture", () => {
  test("a click in the middle of the viewport lands in the window's middle", () => {
    // Horizontally the 8px borders are symmetric, so dead centre is 0.5.
    const track = build([clickAt(592, 350)], { width: 1200, height: 800 });
    expect(track.clicks).toHaveLength(1);
    expect(track.clicks[0].x).toBeCloseTo(0.5, 5);
    // Vertically the browser's chrome sits above it: (92 + 350) / 800.
    expect(track.clicks[0].y).toBeCloseTo(0.5525, 5);
  });

  test("the capture's pixel size doesn't matter, only its shape", () => {
    // Same window, captured on a display scaled 1.6×. Normalised coordinates
    // must come out identical or display scaling would move every zoom.
    const small = build([clickAt(592, 350)], { width: 1200, height: 800 });
    const large = build([clickAt(592, 350)], { width: 1920, height: 1280 });
    expect(large.clicks[0].x).toBeCloseTo(small.clicks[0].x, 5);
    expect(large.clicks[0].y).toBeCloseTo(small.clicks[0].y, 5);
  });

  test("moving the window doesn't move the click inside it", () => {
    // A window capture follows the window, so where it sits on the desktop
    // has to cancel out entirely — including onto a second monitor.
    const here = build([clickAt(592, 350)], { width: 1200, height: 800 });
    const moved = build(
      [clickAt(592, 350, { left: 2560, top: 400, width: 1200, height: 800 })],
      { width: 1200, height: 800 },
    );
    expect(moved.clicks[0].x).toBeCloseTo(here.clicks[0].x, 5);
    expect(moved.clicks[0].y).toBeCloseTo(here.clicks[0].y, 5);
  });

  test("page zoom is taken out of the position", () => {
    // At 2× zoom the same element sits at half the client coordinate, so the
    // two have to describe the same point on screen.
    const plain = build([clickAt(592, 350)], { width: 1200, height: 800 });
    const zoomed = buildCursorTrack(
      [
        {
          t: STARTED + 1000,
          cx: 296,
          cy: 175,
          iw: 592,
          ih: 350,
          win: WINDOW,
          zoom: 2,
          click: 0,
        },
      ],
      {
        startedAt: STARTED,
        pauses: [],
        displaySurface: "window",
        displays: null,
        capture: { width: 1200, height: 800 },
      },
    );
    expect(zoomed.clicks[0].x).toBeCloseTo(plain.clicks[0].x, 5);
    expect(zoomed.clicks[0].y).toBeCloseTo(plain.clicks[0].y, 5);
  });

  test("a window shaped unlike the capture is not the one being recorded", () => {
    // 1200×800 is 3:2; the capture is 16:9. Whatever this click was in, it
    // wasn't the surface in the video.
    const track = build([clickAt(592, 350)], { width: 1920, height: 1080 });
    expect(track.clicks).toHaveLength(0);
    expect(track.samples).toHaveLength(0);
  });

  test("without the capture's size nothing can be placed", () => {
    const track = build([clickAt(592, 350)], null);
    expect(track.samples).toHaveLength(0);
  });

  test("a size of zero is no size at all", () => {
    // A capture track reports no dimensions until it has produced a frame,
    // so zeroes are what an answer asked for too early looks like. They must
    // not read as a 1:1 window, or every shape check would turn on timing.
    const track = build([clickAt(592, 350)], { width: 0, height: 0 });
    expect(track.samples).toHaveLength(0);
  });

  test("an older companion that can't report its window is dropped", () => {
    // No cx/win means only screen coordinates, which say nothing about where
    // the window was — so there is no way to place it inside one.
    const track = build(
      [{ t: STARTED + 1000, screenX: 700, screenY: 450, sw: 2560, sh: 1440 }],
      { width: 1200, height: 800 },
    );
    expect(track.samples).toHaveLength(0);
  });

  test("says which space it used", () => {
    expect(build([clickAt(592, 350)], { width: 1200, height: 800 }).space).toBe(
      "window-surface",
    );
  });
});

describe("which surfaces are allowed to collect", () => {
  test("a tab and a window both are", () => {
    expect(surfaceSupportsCursor("browser")).toBe(true);
    expect(surfaceSupportsCursor("window")).toBe(true);
  });

  test("anything unrecognised isn't", () => {
    expect(surfaceSupportsCursor(undefined)).toBe(false);
    expect(surfaceSupportsCursor("something-new")).toBe(false);
  });
});
