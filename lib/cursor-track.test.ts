import { describe, expect, test } from "bun:test";
import {
  CLICK_LIFE,
  autoZoomRegions,
  clickEffectsAt,
  hasCursorData,
  type CursorTrack,
} from "@/lib/cursor-track";
import { ZOOM_MAX_SCALE, type ZoomRegion } from "@/lib/scene";

// Where auto zoom lands is a matter of taste and is judged by eye. What can
// be pinned down is what must never happen: regions on top of each other,
// ones too short to read, a push-in past what the frame can hold, or one
// landing on top of a zoom placed by hand.

const click = (t: number, x = 0.5, y = 0.5, button = 0) => ({
  t: t * 1000,
  x,
  y,
  button,
});

/** A pointer that moves the whole time, so only clicks anchor anything. */
function busy(duration: number, clicks: ReturnType<typeof click>[]): CursorTrack {
  const samples = [];
  for (let t = 0; t < duration; t += 1 / 30) {
    samples.push({
      t: t * 1000,
      x: 0.5 + 0.35 * Math.sin(t * 4),
      y: 0.5 + 0.35 * Math.cos(t * 5),
    });
  }
  return { samples, clicks };
}

/** A pointer parked at one spot for a stretch, moving otherwise. */
function resting(
  duration: number,
  rests: [number, number, number, number][],
): CursorTrack {
  const samples = [];
  for (let t = 0; t < duration; t += 1 / 30) {
    const rest = rests.find(([a, b]) => t >= a && t < b);
    samples.push(
      rest
        ? { t: t * 1000, x: rest[2], y: rest[3] }
        : {
            t: t * 1000,
            x: 0.5 + 0.35 * Math.sin(t * 4),
            y: 0.5 + 0.35 * Math.cos(t * 5),
          },
    );
  }
  return { samples, clicks: [] };
}

/** Every rule a set of proposed regions has to satisfy. */
function expectWellFormed(regions: ZoomRegion[], duration: number) {
  for (const region of regions) {
    expect(region.end).toBeGreaterThan(region.start);
    expect(region.start).toBeGreaterThanOrEqual(0);
    expect(region.end).toBeLessThanOrEqual(duration);
    expect(region.end - region.start).toBeGreaterThanOrEqual(0.85);
    expect(region.scale).toBeGreaterThan(1);
    expect(region.scale).toBeLessThanOrEqual(ZOOM_MAX_SCALE);
    expect(region.x).toBeGreaterThanOrEqual(0);
    expect(region.x).toBeLessThanOrEqual(1);
    expect(region.y).toBeGreaterThanOrEqual(0);
    expect(region.y).toBeLessThanOrEqual(1);
    expect(region.auto).toBe(true);
  }
  for (let i = 1; i < regions.length; i++) {
    // Each one has to let go before the next begins, or the frame just slides.
    expect(regions[i].start).toBeGreaterThan(regions[i - 1].end);
  }
}

describe("click effects", () => {
  const track: CursorTrack = { samples: [], clicks: [click(5, 0.3, 0.7)] };

  test("appear at the click and fade out", () => {
    expect(clickEffectsAt(track, 4.9)).toHaveLength(0);
    expect(clickEffectsAt(track, 5)).toHaveLength(1);
    expect(clickEffectsAt(track, 5 + CLICK_LIFE - 0.01)).toHaveLength(1);
    expect(clickEffectsAt(track, 5 + CLICK_LIFE + 0.01)).toHaveLength(0);
  });

  test("run from nought to one over their life", () => {
    expect(clickEffectsAt(track, 5)[0].progress).toBeCloseTo(0, 6);
    expect(clickEffectsAt(track, 5 + CLICK_LIFE / 2)[0].progress).toBeCloseTo(0.5, 6);
  });

  test("keep the click's own position and button", () => {
    const [effect] = clickEffectsAt(track, 5.1);
    expect(effect.x).toBeCloseTo(0.3, 6);
    expect(effect.y).toBeCloseTo(0.7, 6);
    expect(effect.secondary).toBe(false);
    const right: CursorTrack = { samples: [], clicks: [click(1, 0.5, 0.5, 2)] };
    expect(clickEffectsAt(right, 1.1)[0].secondary).toBe(true);
  });
});

describe("hasCursorData", () => {
  test("needs more than a single sample to be worth anything", () => {
    expect(hasCursorData(null)).toBe(false);
    expect(hasCursorData({ samples: [], clicks: [] })).toBe(false);
    expect(hasCursorData({ samples: [{ t: 0, x: 0, y: 0 }], clicks: [] })).toBe(false);
    expect(
      hasCursorData({
        samples: [
          { t: 0, x: 0, y: 0 },
          { t: 1, x: 0, y: 0 },
        ],
        clicks: [],
      }),
    ).toBe(true);
  });
});

describe("auto zoom", () => {
  test("proposes nothing when there was nothing to go on", () => {
    expect(autoZoomRegions({ samples: [], clicks: [] }, 20)).toHaveLength(0);
    expect(autoZoomRegions(busy(20, []), 0)).toHaveLength(0);
  });

  test("a burst of clicks in one place earns one push-in", () => {
    const regions = autoZoomRegions(
      busy(20, [click(8, 0.6, 0.4), click(8.6, 0.62, 0.42), click(9.2, 0.61, 0.39)]),
      20,
    );
    expect(regions).toHaveLength(1);
    expectWellFormed(regions, 20);
    expect(regions[0].x).toBeCloseTo(0.61, 1);
    expect(regions[0].start).toBeLessThan(8);
    expect(regions[0].end).toBeGreaterThan(9.2);
  });

  test("a click somewhere else is its own moment, not absorbed into the last", () => {
    const regions = autoZoomRegions(
      busy(24, [click(8, 0.15, 0.15), click(9.4, 0.85, 0.85)]),
      24,
    );
    expect(regions.length).toBeGreaterThanOrEqual(2);
    expectWellFormed(regions, 24);
    // Two corners, framed separately rather than as one shot over everything.
    const spread = Math.abs(regions[0].x - regions[1].x);
    expect(spread).toBeGreaterThan(0.3);
  });

  test("a pointer that settles is enough on its own", () => {
    const regions = autoZoomRegions(resting(24, [[8, 13, 0.7, 0.3]]), 24);
    expect(regions.length).toBeGreaterThanOrEqual(1);
    expectWellFormed(regions, 24);
    expect(regions[0].x).toBeCloseTo(0.7, 1);
    expect(regions[0].y).toBeCloseTo(0.3, 1);
  });

  test("but a resting pointer is never pushed as close as a click can be", () => {
    // Both frame something small enough to justify the closest shot they're
    // each allowed; the ceilings are what differ.
    const [dwell] = autoZoomRegions(resting(24, [[8, 13, 0.7, 0.3]]), 24);
    const [clicked] = autoZoomRegions(
      busy(24, [click(9, 0.66, 0.28), click(9.5, 0.74, 0.33)]),
      24,
    );
    expect(clicked.scale).toBeCloseTo(ZOOM_MAX_SCALE, 5);
    expect(dwell.scale).toBeLessThan(clicked.scale);
    expect(dwell.scale).toBeLessThanOrEqual(1.9);
  });

  test("the clip opens and closes flat", () => {
    const regions = autoZoomRegions(
      busy(20, [click(0.05, 0.5, 0.5), click(19.9, 0.5, 0.5)]),
      20,
    );
    for (const region of regions) {
      expect(region.start).toBeGreaterThan(0);
      expect(region.end).toBeLessThan(20);
    }
  });

  test("several separate moments all come out well formed", () => {
    const regions = autoZoomRegions(
      busy(60, [
        click(6, 0.2, 0.2),
        click(6.4, 0.21, 0.22),
        click(18, 0.8, 0.3),
        click(31, 0.5, 0.8),
        click(31.5, 0.52, 0.79),
        click(44, 0.15, 0.75),
      ]),
      60,
    );
    expect(regions.length).toBeGreaterThanOrEqual(3);
    expectWellFormed(regions, 60);
  });

  test("a zoom placed by hand wins the ground it covers", () => {
    const track = busy(24, [click(9, 0.6, 0.4), click(9.6, 0.61, 0.41)]);
    const alone = autoZoomRegions(track, 24);
    expect(alone.length).toBeGreaterThan(0);

    const mine: ZoomRegion = {
      id: "mine",
      start: 7,
      end: 12,
      x: 0.2,
      y: 0.2,
      scale: 2,
    };
    const withMine = autoZoomRegions(track, 24, [mine]);
    for (const region of withMine) {
      expect(region.start >= mine.end || region.end <= mine.start).toBe(true);
    }
    expect(withMine.length).toBeLessThan(alone.length + 1);
  });

  test("every proposal is marked as the editor's own", () => {
    const regions = autoZoomRegions(busy(24, [click(9), click(9.5)]), 24);
    expect(regions.every((r) => r.auto)).toBe(true);
    expect(new Set(regions.map((r) => r.id)).size).toBe(regions.length);
  });
});
