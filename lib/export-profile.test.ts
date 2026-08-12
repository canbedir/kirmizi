import { describe, expect, test } from "bun:test";
import {
  DOWNLOAD_PROFILE,
  SHARE_MAX_BYTES,
  SHARE_MAX_SECONDS,
  SHARE_PROFILE,
  estimateBytes,
  fitFrame,
  shareRefusal,
  videoBitrate,
} from "@/lib/export-profile";

describe("fitFrame", () => {
  test("a download keeps whatever it was recorded at", () => {
    for (const [w, h] of [
      [3840, 2160],
      [1920, 1080],
      [1080, 1920],
      [640, 360],
    ]) {
      expect(fitFrame(w, h, DOWNLOAD_PROFILE)).toEqual({ w, h });
    }
  });

  test("a share comes down to 1080p, keeping its shape", () => {
    expect(fitFrame(3840, 2160, SHARE_PROFILE)).toEqual({ w: 1920, h: 1080 });
    expect(fitFrame(2560, 1440, SHARE_PROFILE)).toEqual({ w: 1920, h: 1080 });
    const wide = fitFrame(2560, 1080, SHARE_PROFILE);
    expect(wide.w).toBe(1920);
    expect(wide.w / wide.h).toBeCloseTo(2560 / 1080, 2);
  });

  test("a vertical share is held to 1080 across, not 1080 tall", () => {
    // The box turns with the frame; squeezing 9:16 into a landscape box would
    // throw away most of the picture's height for no reason.
    expect(fitFrame(1080, 1920, SHARE_PROFILE)).toEqual({ w: 1080, h: 1920 });
    expect(fitFrame(2160, 3840, SHARE_PROFILE)).toEqual({ w: 1080, h: 1920 });
  });

  test("nothing is ever scaled up", () => {
    expect(fitFrame(640, 360, SHARE_PROFILE)).toEqual({ w: 640, h: 360 });
    expect(fitFrame(320, 240, SHARE_PROFILE)).toEqual({ w: 320, h: 240 });
  });

  test("every result is even, and never zero", () => {
    for (const [w, h] of [
      [1921, 1081],
      [3839, 2159],
      [1, 1],
      [0, 0],
      [1000, 3],
    ]) {
      const fit = fitFrame(w, h, SHARE_PROFILE);
      expect(fit.w % 2).toBe(0);
      expect(fit.h % 2).toBe(0);
      expect(fit.w).toBeGreaterThan(0);
      expect(fit.h).toBeGreaterThan(0);
    }
  });
});

describe("videoBitrate", () => {
  test("a download is generous, and floors at 8 Mbps", () => {
    expect(videoBitrate(1920, 1080, 30, DOWNLOAD_PROFILE)).toBe(12_441_600);
    expect(videoBitrate(640, 360, 30, DOWNLOAD_PROFILE)).toBe(8_000_000);
  });

  test("a share is held to its ceiling however large the frame", () => {
    // The ceiling is applied last, so it beats the floor rather than losing
    // to it — otherwise a 4K share would be encoded at the download's minimum.
    expect(videoBitrate(1920, 1080, 30, SHARE_PROFILE)).toBe(2_500_000);
    expect(videoBitrate(3840, 2160, 30, SHARE_PROFILE)).toBe(2_500_000);
  });

  test("but a smaller share still gets a smaller number", () => {
    expect(videoBitrate(1280, 720, 30, SHARE_PROFILE)).toBeLessThan(2_500_000);
    expect(videoBitrate(1280, 720, 30, SHARE_PROFILE)).toBeGreaterThan(600_000);
    expect(videoBitrate(320, 180, 30, SHARE_PROFILE)).toBe(600_000);
  });

  test("60fps costs more than 30, up to the ceiling", () => {
    expect(videoBitrate(1280, 720, 60, SHARE_PROFILE)).toBeGreaterThan(
      videoBitrate(1280, 720, 30, SHARE_PROFILE),
    );
  });
});

describe("what a share actually weighs", () => {
  test("a full-length 1080p clip lands well inside the size limit", () => {
    // The whole capacity plan rests on this number: two minutes has to be
    // tens of megabytes, not hundreds.
    const fit = fitFrame(1920, 1080, SHARE_PROFILE);
    const bytes = estimateBytes(SHARE_MAX_SECONDS, fit.w, fit.h, 30, SHARE_PROFILE);
    expect(bytes).toBeLessThan(SHARE_MAX_BYTES);
    expect(bytes / 1e6).toBeCloseTo(39.4, 0);
  });

  test("the same clip downloaded is several times larger", () => {
    const share = estimateBytes(SHARE_MAX_SECONDS, 1920, 1080, 30, SHARE_PROFILE);
    const download = estimateBytes(SHARE_MAX_SECONDS, 1920, 1080, 30, DOWNLOAD_PROFILE);
    expect(download / share).toBeGreaterThan(4);
  });

  test("a 4K capture shared is no bigger than a 1080p one", () => {
    const from4k = fitFrame(3840, 2160, SHARE_PROFILE);
    const fromHd = fitFrame(1920, 1080, SHARE_PROFILE);
    expect(estimateBytes(60, from4k.w, from4k.h, 30, SHARE_PROFILE)).toBe(
      estimateBytes(60, fromHd.w, fromHd.h, 30, SHARE_PROFILE),
    );
  });

  test("nothing weighs anything", () => {
    expect(estimateBytes(0, 1920, 1080, 30, SHARE_PROFILE)).toBe(0);
    expect(estimateBytes(-5, 1920, 1080, 30, SHARE_PROFILE)).toBe(0);
  });
});

describe("shareRefusal", () => {
  test("says yes to a clip inside the limit", () => {
    expect(shareRefusal(1)).toBeNull();
    expect(shareRefusal(SHARE_MAX_SECONDS)).toBeNull();
  });

  test("and gives a reason to the ones it turns down", () => {
    expect(shareRefusal(SHARE_MAX_SECONDS + 1)).toMatch(/2 minutes/);
    expect(shareRefusal(0)).toMatch(/nothing/i);
  });
});
