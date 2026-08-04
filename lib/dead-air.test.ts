import { describe, expect, test } from "bun:test";
import { findDeadAir } from "@/lib/dead-air";
import type { CursorTrack } from "@/lib/cursor-track";
import type { MomentaryLevel } from "@/lib/loudness";
import type { Segment } from "@/lib/use-video-editor";

const STEP = 0.1;

/** A loudness profile: `quiet` spans drop to `floor`, the rest is speech. */
function profile(
  duration: number,
  quiet: [number, number][],
  speech = -20,
  floor = -70,
): MomentaryLevel[] {
  const out: MomentaryLevel[] = [];
  for (let t = 0.2; t < duration; t += STEP) {
    const hushed = quiet.some(([a, b]) => t >= a && t < b);
    out.push({ t, lufs: hushed ? floor : speech });
  }
  return out;
}

/**
 * A cursor track that moves except during `parked`. The companion only
 * reports the pointer when it moves, so a parked stretch has no samples in
 * it at all — that's the shape the real data has.
 */
function track(
  duration: number,
  parked: [number, number][],
  clicks: number[] = [],
): CursorTrack {
  const samples = [];
  for (let t = 0; t < duration; t += 1 / 60) {
    if (parked.some(([a, b]) => t >= a && t < b)) continue;
    samples.push({
      t: t * 1000,
      x: 0.2 + 0.3 * Math.sin(t * 3),
      y: 0.5 + 0.2 * Math.cos(t * 2),
    });
  }
  return {
    samples,
    clicks: clicks.map((t) => ({ t: t * 1000, x: 0.5, y: 0.5, button: 0 })),
  };
}

const whole = (duration: number): Segment[] => [
  { id: "a", start: 0, end: duration, muted: false, speed: 1 },
];

const D = 20;

describe("neither signal decides alone", () => {
  test("silence alone isn't enough — something is happening", () => {
    const report = findDeadAir({
      duration: D,
      segments: whole(D),
      profile: profile(D, [[6, 11]]),
      integrated: -20,
      track: track(D, []),
    });
    expect(report.ranges).toHaveLength(0);
  });

  test("a parked pointer alone isn't either — someone is talking", () => {
    const report = findDeadAir({
      duration: D,
      segments: whole(D),
      profile: profile(D, []),
      integrated: -20,
      track: track(D, [[6, 11]]),
    });
    expect(report.ranges).toHaveLength(0);
  });

  test("together they are dead air", () => {
    const report = findDeadAir({
      duration: D,
      segments: whole(D),
      profile: profile(D, [[6, 11]]),
      integrated: -20,
      track: track(D, [[6, 11]]),
    });
    expect(report.ranges).toHaveLength(1);
    expect(report.used).toEqual({ sound: true, pointer: true });
  });

  test("a beat is left at each end rather than cutting to the word", () => {
    const [cut] = findDeadAir({
      duration: D,
      segments: whole(D),
      profile: profile(D, [[6, 11]]),
      integrated: -20,
      track: track(D, [[6, 11]]),
    }).ranges;
    // The pointer stops at 6 and starts again at 11; stillness is judged over
    // a window centred on each moment, so the run is already inset before the
    // pad is applied. About half a second survives at each end.
    expect(cut.start).toBeGreaterThan(6.3);
    expect(cut.start).toBeLessThan(6.8);
    expect(cut.end).toBeGreaterThan(10.2);
    expect(cut.end).toBeLessThan(10.7);
  });
});

describe("when only one signal exists, it carries", () => {
  test("a silent screencast is judged on the pointer", () => {
    const report = findDeadAir({
      duration: D,
      segments: whole(D),
      profile: null,
      track: track(D, [[6, 11]]),
    });
    expect(report.ranges).toHaveLength(1);
    expect(report.used).toEqual({ sound: false, pointer: true });
  });

  test("a recording made without the companion is judged on the sound", () => {
    const report = findDeadAir({
      duration: D,
      segments: whole(D),
      profile: profile(D, [[6, 11]]),
      integrated: -20,
      track: null,
    });
    expect(report.ranges).toHaveLength(1);
    expect(report.used).toEqual({ sound: true, pointer: false });
  });

  test("with neither, the clip is left alone rather than guessed at", () => {
    const report = findDeadAir({
      duration: D,
      segments: whole(D),
      profile: null,
      track: null,
    });
    expect(report.ranges).toHaveLength(0);
    expect(report.removed).toBe(0);
  });
});

describe("what must survive", () => {
  test("a breath between sentences is not dead air", () => {
    const report = findDeadAir({
      duration: D,
      segments: whole(D),
      profile: profile(D, [[6, 6.8]]),
      integrated: -20,
      track: track(D, [[6, 6.8]]),
    });
    expect(report.ranges).toHaveLength(0);
  });

  test("a click keeps its moment alive and splits the cut around it", () => {
    const report = findDeadAir({
      duration: D,
      segments: whole(D),
      profile: profile(D, [[6, 14]]),
      integrated: -20,
      track: track(D, [[6, 14]], [10]),
    });
    expect(report.ranges).toHaveLength(2);
    // Nothing survives across the click itself.
    for (const range of report.ranges) {
      expect(range.start >= 10 || range.end <= 10).toBe(true);
    }
  });

  test("a quietly recorded voice is judged against its own level", () => {
    // Everything 30 dB down: speech at -50, pauses at -95.
    const report = findDeadAir({
      duration: D,
      segments: whole(D),
      profile: profile(D, [[6, 11]], -50, -95),
      integrated: -50,
      track: track(D, [[6, 11]]),
    });
    expect(report.ranges).toHaveLength(1);
  });
});

describe("the ends, and what's already gone", () => {
  test("dead air at the head and tail is cut right out to the edges", () => {
    const report = findDeadAir({
      duration: D,
      segments: whole(D),
      profile: profile(D, [
        [0, 4],
        [17, D],
      ]),
      integrated: -20,
      track: track(D, [
        [0, 4],
        [17, D],
      ]),
    });
    expect(report.ranges).toHaveLength(2);
    expect(report.ranges[0].start).toBe(0);
    expect(report.ranges[1].end).toBeCloseTo(D, 5);
  });

  test("a stretch already cut isn't proposed a second time", () => {
    const shared = {
      duration: D,
      profile: profile(D, [[6, 11]]),
      integrated: -20,
      track: track(D, [[6, 11]]),
    };
    expect(findDeadAir({ ...shared, segments: whole(D) }).ranges).toHaveLength(1);
    expect(
      findDeadAir({
        ...shared,
        segments: [
          { id: "a", start: 0, end: 5, muted: false, speed: 1 },
          { id: "b", start: 12, end: D, muted: false, speed: 1 },
        ],
      }).ranges,
    ).toHaveLength(0);
  });

  test("removed is the sum of what it would take out", () => {
    const report = findDeadAir({
      duration: D,
      segments: whole(D),
      profile: profile(D, [[6, 11]]),
      integrated: -20,
      track: track(D, [[6, 11]]),
    });
    const summed = report.ranges.reduce((sum, r) => sum + (r.end - r.start), 0);
    expect(report.removed).toBeCloseTo(summed, 6);
    expect(report.removed).toBeGreaterThan(3);
    expect(report.removed).toBeLessThan(5);
  });

  test("ranges never overlap and always run forward", () => {
    const report = findDeadAir({
      duration: 40,
      segments: whole(40),
      profile: profile(40, [
        [3, 8],
        [14, 20],
        [28, 36],
      ]),
      integrated: -20,
      track: track(40, [
        [3, 8],
        [14, 20],
        [28, 36],
      ]),
    });
    expect(report.ranges.length).toBeGreaterThan(1);
    for (const range of report.ranges) expect(range.end).toBeGreaterThan(range.start);
    for (let i = 1; i < report.ranges.length; i++) {
      expect(report.ranges[i].start).toBeGreaterThanOrEqual(report.ranges[i - 1].end);
    }
  });

  test("an empty clip is not analysed", () => {
    expect(
      findDeadAir({ duration: 0, segments: [], profile: null, track: null }).ranges,
    ).toHaveLength(0);
  });
});
