import { describe, expect, test } from "bun:test";
import {
  PEAK_CEILING_DBTP,
  TARGET_LUFS,
  interpolationPhases,
  kWeighting,
  normalisation,
  type LoudnessReport,
} from "@/lib/loudness";

// The measurement itself needs an audio context and is checked in a browser
// against the EBU Tech 3341 signals (see the verify skill). What can be
// checked here is what it all rests on: the filter the standard specifies,
// the kernel that finds peaks between samples, and the gain arithmetic.

const report = (extra: Partial<LoudnessReport> = {}): LoudnessReport => ({
  integrated: -23,
  truePeak: -6,
  samplePeak: -6.2,
  gatedSeconds: 10,
  ...extra,
});

describe("K-weighting", () => {
  // BS.1770-4, table 1: the coefficients at 48 kHz. Ours are derived from the
  // analog prototype so they hold at any rate — which is only worth anything
  // if they reproduce the published ones exactly.
  test("reproduces the published 48 kHz coefficients", () => {
    const [shelf, highpass] = kWeighting(48000);
    expect(shelf.feedforward[0]).toBeCloseTo(1.53512485958697, 11);
    expect(shelf.feedforward[1]).toBeCloseTo(-2.69169618940638, 11);
    expect(shelf.feedforward[2]).toBeCloseTo(1.19839281085285, 11);
    expect(shelf.feedback[1]).toBeCloseTo(-1.69065929318241, 11);
    expect(shelf.feedback[2]).toBeCloseTo(0.73248077421585, 11);

    expect(highpass.feedforward).toEqual([1, -2, 1]);
    expect(highpass.feedback[1]).toBeCloseTo(-1.99004745483398, 11);
    expect(highpass.feedback[2]).toBeCloseTo(0.99007225036621, 11);
  });

  test("both stages are normalised, so a0 is 1", () => {
    for (const rate of [44100, 48000, 96000]) {
      for (const stage of kWeighting(rate)) {
        expect(stage.feedback[0]).toBe(1);
      }
    }
  });

  test("stays stable at every rate we might see", () => {
    for (const rate of [8000, 16000, 22050, 44100, 48000, 88200, 96000, 192000]) {
      for (const stage of kWeighting(rate)) {
        // A two-pole filter is stable when its poles are inside the unit
        // circle, which for a1/a2 is this triangle.
        const [, a1, a2] = stage.feedback;
        expect(Math.abs(a2)).toBeLessThan(1);
        expect(Math.abs(a1)).toBeLessThan(1 + a2);
        for (const c of [...stage.feedforward, ...stage.feedback]) {
          expect(Number.isFinite(c)).toBe(true);
        }
      }
    }
  });

  test("the shelf lifts the treble and the high-pass discards rumble", () => {
    const [shelf, highpass] = kWeighting(48000);
    // Response of a biquad at a given frequency, as a magnitude.
    const gain = (stage: typeof shelf, hz: number) => {
      const w = (2 * Math.PI * hz) / 48000;
      const re = (arr: number[]) =>
        arr[0] + arr[1] * Math.cos(w) + arr[2] * Math.cos(2 * w);
      const im = (arr: number[]) =>
        -(arr[1] * Math.sin(w) + arr[2] * Math.sin(2 * w));
      const num = Math.hypot(re(stage.feedforward), im(stage.feedforward));
      const den = Math.hypot(re(stage.feedback), im(stage.feedback));
      return 20 * Math.log10(num / den);
    };
    // +4 dB of shelf, well above the corner.
    expect(gain(shelf, 10000)).toBeCloseTo(4, 0);
    expect(gain(shelf, 100)).toBeCloseTo(0, 0);
    // The high-pass is flat where speech lives and steep below it.
    expect(gain(highpass, 1000)).toBeCloseTo(0, 1);
    expect(gain(highpass, 20)).toBeLessThan(-8);
  });
});

describe("the true-peak interpolator", () => {
  const phases = interpolationPhases();

  test("has one kernel per sub-sample", () => {
    expect(phases).toHaveLength(4);
  });

  test("each kernel passes a steady signal through unchanged", () => {
    for (const taps of phases) {
      const sum = taps.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 6);
    }
  });

  test("the first phase is the sample itself, untouched", () => {
    const first = phases[0];
    for (let k = 0; k < first.length; k++) {
      expect(first[k]).toBeCloseTo(k === first.length / 2 - 1 ? 1 : 0, 6);
    }
  });

  test("the others actually interpolate", () => {
    for (let p = 1; p < phases.length; p++) {
      const biggest = Math.max(...Array.from(phases[p], Math.abs));
      expect(biggest).toBeLessThan(1);
      expect(biggest).toBeGreaterThan(0.3);
    }
  });
});

describe("normalisation", () => {
  test("lifts a quiet clip exactly onto the target", () => {
    const { gain, reached, peakLimited } = normalisation(
      report({ integrated: -30, truePeak: -20 }),
    );
    expect(reached).toBeCloseTo(TARGET_LUFS, 6);
    expect(20 * Math.log10(gain)).toBeCloseTo(14, 6);
    expect(peakLimited).toBe(false);
  });

  test("turns a hot clip down rather than leaving it", () => {
    const { gain, reached } = normalisation(report({ integrated: -6, truePeak: -3 }));
    expect(gain).toBeLessThan(1);
    expect(reached).toBeCloseTo(TARGET_LUFS, 6);
  });

  test("the peak ceiling beats the target", () => {
    // Quiet but peaky: reaching -16 would push it past the ceiling.
    const { gain, reached, peakLimited } = normalisation(
      report({ integrated: -30, truePeak: -2 }),
    );
    expect(peakLimited).toBe(true);
    expect(20 * Math.log10(gain)).toBeCloseTo(1, 6);
    expect(reached).toBeCloseTo(-29, 6);
    expect(reached).toBeLessThan(TARGET_LUFS);
  });

  test("nothing it does can push the peak past the ceiling", () => {
    for (const integrated of [-40, -30, -23, -16, -9, -3]) {
      for (const truePeak of [-20, -12, -6, -1.5, -0.2]) {
        const { gain } = normalisation(report({ integrated, truePeak }));
        const after = truePeak + 20 * Math.log10(gain);
        expect(after).toBeLessThanOrEqual(PEAK_CEILING_DBTP + 1e-9);
      }
    }
  });

  test("silence is left alone rather than amplified into noise", () => {
    const { gain, peakLimited } = normalisation(
      report({ integrated: -Infinity, truePeak: -Infinity }),
    );
    expect(gain).toBe(1);
    expect(peakLimited).toBe(false);
  });

  test("a custom target and ceiling are honoured", () => {
    const { reached } = normalisation(report({ integrated: -30, truePeak: -30 }), -14, -1);
    expect(reached).toBeCloseTo(-14, 6);
  });
});
