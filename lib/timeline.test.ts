import { describe, expect, test } from "bun:test";
import { outputTimeAt, place, plan } from "@/lib/timeline";
import type { Segment } from "@/lib/use-video-editor";

const seg = (
  start: number,
  end: number,
  extra: Partial<Segment> = {},
): Segment => ({
  id: `${start}-${end}`,
  start,
  end,
  muted: false,
  speed: 1,
  ...extra,
});

/** Frames at a steady rate, as a source recording would have. */
const frames = (from: number, to: number, fps = 30) => {
  const out: number[] = [];
  for (let i = Math.ceil(from * fps); i / fps < to; i++) out.push(i / fps);
  return out;
};

describe("place", () => {
  test("lays kept segments end to end", () => {
    const { placed, total } = place([seg(0, 3), seg(7, 10)]);
    expect(total).toBeCloseTo(6, 6);
    expect(placed[0].outStart).toBeCloseTo(0, 6);
    expect(placed[0].outEnd).toBeCloseTo(3, 6);
    // The gap in the source closes up in the export.
    expect(placed[1].outStart).toBeCloseTo(3, 6);
    expect(placed[1].outEnd).toBeCloseTo(6, 6);
  });

  test("a segment's speed shortens the time it takes, not the source it covers", () => {
    const { placed, total } = place([seg(0, 4, { speed: 2 })]);
    expect(total).toBeCloseTo(2, 6);
    expect(placed[0].start).toBe(0);
    expect(placed[0].end).toBe(4);
  });

  test("mixed speeds accumulate in order", () => {
    const { placed, total } = place([
      seg(0, 4, { speed: 2 }),
      seg(4, 6),
      seg(6, 8, { speed: 0.5 }),
    ]);
    expect(total).toBeCloseTo(2 + 2 + 4, 6);
    expect(placed[1].outStart).toBeCloseTo(2, 6);
    expect(placed[2].outStart).toBeCloseTo(4, 6);
  });
});

describe("outputTimeAt", () => {
  const { placed } = place([seg(0, 3), seg(7, 10)]);

  test("maps a kept moment into the export", () => {
    expect(outputTimeAt(placed, 1)).toBeCloseTo(1, 6);
    expect(outputTimeAt(placed, 8)).toBeCloseTo(4, 6);
  });

  test("reports nothing for a moment that was cut", () => {
    expect(outputTimeAt(placed, 5)).toBeNull();
  });

  test("a segment owns its in-point but not its out-point", () => {
    expect(outputTimeAt(placed, 0)).toBeCloseTo(0, 6);
    // 3 is where the first segment ends and the cut begins.
    expect(outputTimeAt(placed, 3)).toBeNull();
  });

  test("speed compresses the mapping", () => {
    const { placed: fast } = place([seg(0, 4, { speed: 2 })]);
    expect(outputTimeAt(fast, 2)).toBeCloseTo(1, 6);
  });
});

describe("plan", () => {
  test("keeps every source frame of an uncut clip, once", () => {
    const stamps = frames(0, 2);
    const { placed } = place([seg(0, 2)]);
    const shots = plan(placed, stamps, 2);
    expect(shots).toHaveLength(stamps.length);
    expect(shots.map((s) => s.source)).toEqual(stamps);
  });

  test("the first frame lands at zero", () => {
    // A trim that starts between two frames: the one showing there is earlier.
    const stamps = frames(0, 5);
    const { placed } = place([seg(2.317, 3)]);
    const shots = plan(placed, stamps, 5);
    expect(shots[0].out).toBe(0);
    // …and it's the frame that was on screen at 2.317, not the next one.
    expect(shots[0].source).toBeLessThanOrEqual(2.317);
    expect(shots[0].source).toBeGreaterThan(2.317 - 1 / 30);
  });

  test("the shots add up to exactly the edited length", () => {
    const stamps = frames(0, 10);
    const { placed, total } = place([seg(0, 3), seg(7, 10)]);
    const shots = plan(placed, stamps, 10);
    const covered = shots.reduce((sum, s) => sum + s.hold, 0);
    expect(covered).toBeCloseTo(total, 6);
    expect(covered).toBeCloseTo(6, 6);
  });

  test("holds are contiguous — no gap and no overlap", () => {
    const stamps = frames(0, 6);
    const { placed } = place([seg(0, 2), seg(4, 6)]);
    const shots = plan(placed, stamps, 6);
    for (let i = 1; i < shots.length; i++) {
      expect(shots[i].out).toBeCloseTo(shots[i - 1].out + shots[i - 1].hold, 6);
    }
  });

  test("output time only ever moves forward", () => {
    const stamps = frames(0, 8);
    const { placed } = place([seg(0, 2, { speed: 2 }), seg(5, 8)]);
    const shots = plan(placed, stamps, 8);
    for (let i = 1; i < shots.length; i++) {
      expect(shots[i].out).toBeGreaterThan(shots[i - 1].out);
    }
  });

  test("speed halves the time between frames without dropping any", () => {
    const stamps = frames(0, 2);
    const { placed } = place([seg(0, 2, { speed: 2 })]);
    const shots = plan(placed, stamps, 2);
    expect(shots).toHaveLength(stamps.length);
    const covered = shots.reduce((sum, s) => sum + s.hold, 0);
    expect(covered).toBeCloseTo(1, 6);
  });

  test("a segment shorter than one frame still gets a frame", () => {
    const stamps = frames(0, 5);
    const { placed } = place([seg(2.01, 2.02)]);
    const shots = plan(placed, stamps, 5);
    expect(shots).toHaveLength(1);
    expect(shots[0].hold).toBeGreaterThan(0);
  });

  test("a clip with no frames at all still produces one", () => {
    const { placed } = place([seg(0, 1)]);
    const shots = plan(placed, [], 1);
    expect(shots).toHaveLength(1);
    expect(shots[0].out).toBe(0);
  });

  test("variable frame timing is carried through, not resampled", () => {
    // A capture that stuttered: the exported frames must be the same moments.
    const stamps = [0, 0.03, 0.07, 0.09, 0.3, 0.34, 0.5];
    const { placed } = place([seg(0, 0.6)]);
    const shots = plan(placed, stamps, 0.6);
    expect(shots.map((s) => s.source)).toEqual(stamps);
  });
});
