import { describe, expect, test } from "bun:test";
import {
  ASPECTS,
  CROP_MIN,
  DEFAULT_FRAME_STYLE,
  FULL_CROP,
  ZOOM_MAX_SCALE,
  aspectById,
  clampCrop,
  cropPixels,
  cropRect,
  cssZoomTransform,
  fitCrop,
  frameSizeFor,
  isDefaultFrame,
  isFullCrop,
  outputSize,
  radiusPx,
  sceneActive,
  videoRect,
  zoomStateAt,
  type ZoomRegion,
} from "@/lib/scene";

const zoom = (extra: Partial<ZoomRegion> = {}): ZoomRegion => ({
  id: "z",
  start: 2,
  end: 6,
  x: 0.5,
  y: 0.5,
  scale: 2,
  ...extra,
});

describe("outputSize", () => {
  test("Source keeps the capture, rounded to something encodable", () => {
    expect(outputSize(1920, 1080, "source")).toEqual({ w: 1920, h: 1080 });
    // H.264 in 4:2:0 can't take an odd edge.
    expect(outputSize(1921, 1081, "source")).toEqual({ w: 1922, h: 1082 });
  });

  test("keeps the long edge, so vertical lands where it gets uploaded", () => {
    expect(outputSize(1920, 1080, "9:16")).toEqual({ w: 1080, h: 1920 });
    expect(outputSize(1280, 720, "9:16")).toEqual({ w: 720, h: 1280 });
  });

  test("square and portrait fall out of the same rule", () => {
    expect(outputSize(1920, 1080, "1:1")).toEqual({ w: 1920, h: 1920 });
    expect(outputSize(1920, 1080, "4:5")).toEqual({ w: 1536, h: 1920 });
  });

  test("a 16:9 capture asked for 16:9 is left alone", () => {
    expect(outputSize(1920, 1080, "16:9")).toEqual({ w: 1920, h: 1080 });
  });

  test("a 4:3 capture reframes off its own long edge", () => {
    expect(outputSize(1600, 1200, "16:9")).toEqual({ w: 1600, h: 900 });
  });

  test("every preset produces even, positive dimensions", () => {
    for (const preset of ASPECTS) {
      for (const [w, h] of [
        [1920, 1080],
        [1280, 720],
        [3840, 2160],
        [1600, 1200],
        [1080, 1920],
      ]) {
        const size = outputSize(w, h, preset.id);
        expect(size.w % 2).toBe(0);
        expect(size.h % 2).toBe(0);
        expect(size.w).toBeGreaterThan(0);
        expect(size.h).toBeGreaterThan(0);
      }
    }
  });

  test("a capture with no size doesn't produce a broken frame", () => {
    expect(outputSize(0, 0, "9:16")).toEqual({ w: 2, h: 2 });
  });

  test("an unknown id falls back to the capture's own shape", () => {
    expect(aspectById("nonsense").id).toBe("source");
    expect(outputSize(1920, 1080, "nonsense")).toEqual({ w: 1920, h: 1080 });
  });
});

describe("videoRect", () => {
  test("with no padding and the same shape, the video fills the frame", () => {
    expect(videoRect(1920, 1080, 0)).toEqual({ x: 0, y: 0, w: 1920, h: 1080 });
  });

  test("padding leaves at least its margin on every side", () => {
    // The margin is a fraction of the shorter edge — 50px here. It binds on
    // the short axis; the long one gets more, because keeping the picture's
    // proportions matters more than an even border.
    const rect = videoRect(1000, 500, 0.1);
    expect(rect.y).toBeCloseTo(50, 5);
    expect(rect.h).toBeCloseTo(400, 5);
    expect(rect.x).toBeGreaterThanOrEqual(50);
    expect(rect.w / rect.h).toBeCloseTo(1000 / 500, 6);
  });

  test("a square frame gets an even border all round", () => {
    const rect = videoRect(1000, 1000, 0.1);
    expect(rect.x).toBeCloseTo(100, 5);
    expect(rect.y).toBeCloseTo(100, 5);
    expect(rect.w).toBeCloseTo(800, 5);
    expect(rect.h).toBeCloseTo(800, 5);
  });

  test("a wide capture in a tall frame keeps its proportions", () => {
    const rect = videoRect(1080, 1920, 0, 1920, 1080);
    expect(rect.w).toBeCloseTo(1080, 5);
    expect(rect.h).toBeCloseTo(1080 * (1080 / 1920), 5);
    expect(rect.w / rect.h).toBeCloseTo(1920 / 1080, 6);
  });

  test("and sits in the middle of it", () => {
    const rect = videoRect(1080, 1920, 0, 1920, 1080);
    expect(rect.x).toBeCloseTo(0, 5);
    expect(rect.y + rect.h / 2).toBeCloseTo(960, 5);
  });

  test("the video never leaves the frame, whatever the padding", () => {
    for (const padding of [0, 0.05, 0.16, 0.35, 1]) {
      for (const [fw, fh, sw, sh] of [
        [1920, 1080, 1920, 1080],
        [1080, 1920, 1920, 1080],
        [1920, 1920, 1280, 720],
      ]) {
        const rect = videoRect(fw, fh, padding, sw, sh);
        expect(rect.x).toBeGreaterThanOrEqual(-1e-6);
        expect(rect.y).toBeGreaterThanOrEqual(-1e-6);
        expect(rect.x + rect.w).toBeLessThanOrEqual(fw + 1e-6);
        expect(rect.y + rect.h).toBeLessThanOrEqual(fh + 1e-6);
      }
    }
  });
});

describe("radiusPx", () => {
  test("scales with the shorter edge of the video, not the frame", () => {
    const style = { ...DEFAULT_FRAME_STYLE, radius: 0.1 };
    expect(radiusPx(style, { x: 0, y: 0, w: 1000, h: 400 })).toBeCloseTo(40, 5);
  });

  test("is clamped so a corner can't swallow the picture", () => {
    const style = { ...DEFAULT_FRAME_STYLE, radius: 5 };
    expect(radiusPx(style, { x: 0, y: 0, w: 1000, h: 400 })).toBeCloseTo(120, 5);
  });
});

describe("zoomStateAt", () => {
  const zooms = [zoom()];

  test("is flat outside the region", () => {
    expect(zoomStateAt(zooms, 0).scale).toBe(1);
    expect(zoomStateAt(zooms, 8).scale).toBe(1);
  });

  test("is fully in through the middle", () => {
    expect(zoomStateAt(zooms, 4).scale).toBeCloseTo(2, 6);
  });

  test("ramps rather than jumps at the edges", () => {
    const justIn = zoomStateAt(zooms, 2.05).scale;
    expect(justIn).toBeGreaterThan(1);
    expect(justIn).toBeLessThan(2);
    const justOut = zoomStateAt(zooms, 5.95).scale;
    expect(justOut).toBeGreaterThan(1);
    expect(justOut).toBeLessThan(2);
  });

  test("never exceeds the region's own scale", () => {
    for (let t = 0; t <= 8; t += 0.05) {
      const state = zoomStateAt(zooms, t);
      expect(state.scale).toBeGreaterThanOrEqual(1);
      expect(state.scale).toBeLessThanOrEqual(2 + 1e-9);
    }
  });

  test("no zooms means no zoom", () => {
    expect(zoomStateAt([], 3).scale).toBe(1);
  });
});

describe("cropRect", () => {
  test("at rest it's the whole frame", () => {
    expect(cropRect(zoomStateAt([], 0), 1920, 1080)).toEqual({
      x: 0,
      y: 0,
      w: 1920,
      h: 1080,
    });
  });

  test("keeps the frame's shape, so nothing is stretched", () => {
    const crop = cropRect(zoomStateAt([zoom()], 4), 1920, 1080);
    expect(crop.w / crop.h).toBeCloseTo(1920 / 1080, 6);
  });

  test("stays inside the source however far the focus is pushed", () => {
    for (const [x, y] of [
      [0, 0],
      [1, 1],
      [0.5, 0],
      [-1, 2],
    ]) {
      for (const scale of [1.2, 2, ZOOM_MAX_SCALE]) {
        const state = zoomStateAt([zoom({ x, y, scale })], 4);
        const crop = cropRect(state, 1920, 1080);
        expect(crop.x).toBeGreaterThanOrEqual(-1e-6);
        expect(crop.y).toBeGreaterThanOrEqual(-1e-6);
        expect(crop.x + crop.w).toBeLessThanOrEqual(1920 + 1e-6);
        expect(crop.y + crop.h).toBeLessThanOrEqual(1080 + 1e-6);
      }
    }
  });
});

describe("what counts as an edit", () => {
  test("the default frame changes nothing", () => {
    expect(isDefaultFrame(DEFAULT_FRAME_STYLE)).toBe(true);
    expect(sceneActive(DEFAULT_FRAME_STYLE, [])).toBe(false);
  });

  test("a background does", () => {
    expect(sceneActive({ ...DEFAULT_FRAME_STYLE, background: "ember" }, [])).toBe(
      true,
    );
  });

  test("so does reframing, even with no background", () => {
    expect(sceneActive({ ...DEFAULT_FRAME_STYLE, aspect: "9:16" }, [])).toBe(true);
  });

  test("and so does a single zoom", () => {
    expect(sceneActive(DEFAULT_FRAME_STYLE, [zoom()])).toBe(true);
  });
});

describe("crop", () => {
  const half = { x: 0.5, y: 0, w: 0.5, h: 1 };

  test("no crop leaves the capture alone", () => {
    expect(isFullCrop(null)).toBe(true);
    expect(isFullCrop(FULL_CROP)).toBe(true);
    expect(isFullCrop(half)).toBe(false);
    expect(cropPixels(null, 1920, 1080)).toEqual({ x: 0, y: 0, w: 1920, h: 1080 });
  });

  test("is kept inside the capture and never smaller than the minimum", () => {
    expect(clampCrop({ x: -1, y: -1, w: 2, h: 2 })).toEqual(FULL_CROP);
    const tiny = clampCrop({ x: 0.5, y: 0.5, w: 0.001, h: 0.001 });
    expect(tiny.w).toBeCloseTo(CROP_MIN, 6);
    expect(tiny.h).toBeCloseTo(CROP_MIN, 6);
    const pushed = clampCrop({ x: 0.9, y: 0.9, w: 0.4, h: 0.4 });
    expect(pushed.x + pushed.w).toBeLessThanOrEqual(1 + 1e-9);
    expect(pushed.y + pushed.h).toBeLessThanOrEqual(1 + 1e-9);
  });

  test("at rest the shot is exactly the crop", () => {
    const flat = zoomStateAt([], 0);
    expect(cropRect(flat, 1920, 1080, half)).toEqual({ x: 960, y: 0, w: 960, h: 1080 });
  });

  test("a zoom works inside the crop, not the capture", () => {
    const state = zoomStateAt([zoom({ x: 0.75, y: 0.5, scale: 2 })], 4);
    const shot = cropRect(state, 1920, 1080, half);
    // Half the crop's width, not half the capture's.
    expect(shot.w).toBeCloseTo(480, 6);
    expect(shot.h).toBeCloseTo(540, 6);
    expect(shot.x).toBeGreaterThanOrEqual(960);
    expect(shot.x + shot.w).toBeLessThanOrEqual(1920);
  });

  test("a focal point outside the crop is held at its edge", () => {
    // Aimed at the far left, but the crop keeps only the right half.
    const state = zoomStateAt([zoom({ x: 0.05, y: 0.5, scale: 2 })], 4);
    const shot = cropRect(state, 1920, 1080, half);
    expect(shot.x).toBeCloseTo(960, 6);
    expect(shot.x + shot.w).toBeLessThanOrEqual(1920 + 1e-6);
  });

  test("the shot never leaves the crop, at any scale or aim", () => {
    for (const c of [half, { x: 0.1, y: 0.2, w: 0.3, h: 0.4 }, FULL_CROP]) {
      for (const [x, y] of [[0, 0], [1, 1], [0.5, 0.5], [-1, 2]]) {
        for (const scale of [1, 1.5, ZOOM_MAX_SCALE]) {
          const shot = cropRect(zoomStateAt([zoom({ x, y, scale })], 4), 1920, 1080, c);
          const b = cropPixels(c, 1920, 1080);
          expect(shot.x).toBeGreaterThanOrEqual(b.x - 1e-6);
          expect(shot.y).toBeGreaterThanOrEqual(b.y - 1e-6);
          expect(shot.x + shot.w).toBeLessThanOrEqual(b.x + b.w + 1e-6);
          expect(shot.y + shot.h).toBeLessThanOrEqual(b.y + b.h + 1e-6);
        }
      }
    }
  });

  test("the shot keeps the crop's shape, so nothing is stretched", () => {
    for (const c of [half, { x: 0.2, y: 0.1, w: 0.5, h: 0.3 }]) {
      const shot = cropRect(zoomStateAt([zoom({ scale: 2 })], 4), 1920, 1080, c);
      const b = cropPixels(c, 1920, 1080);
      expect(shot.w / shot.h).toBeCloseTo(b.w / b.h, 6);
    }
  });

  test("with no crop it is exactly what it always was", () => {
    for (const scale of [1, 1.4, 2.6]) {
      const state = zoomStateAt([zoom({ x: 0.3, y: 0.7, scale })], 4);
      expect(cropRect(state, 1920, 1080, null)).toEqual(
        cropRect(state, 1920, 1080, FULL_CROP),
      );
    }
  });
});

describe("cssZoomTransform", () => {
  test("is nothing at rest, whatever the crop", () => {
    expect(cssZoomTransform(zoomStateAt([], 0), 1920, 1080)).toBe("");
    expect(
      cssZoomTransform(zoomStateAt([], 0), 1920, 1080, { x: 0.5, y: 0, w: 0.5, h: 1 }),
    ).toBe("");
  });

  test("is expressed against the crop, so the framing can be laid out once", () => {
    const crop = { x: 0.5, y: 0, w: 0.5, h: 1 };
    const state = zoomStateAt([zoom({ x: 0.75, y: 0.5, scale: 2 })], 4);
    // Aimed at the middle of the right half: the shot sits in the middle of
    // the crop, so the offset is a quarter of it either way.
    expect(cssZoomTransform(state, 1920, 1080, crop)).toBe(
      "scale(2.0000) translate(-25.0000%, -25.0000%)",
    );
  });

  test("matches the uncropped form when there's no crop", () => {
    const state = zoomStateAt([zoom({ x: 0.4, y: 0.6, scale: 1.8 })], 4);
    expect(cssZoomTransform(state, 1280, 720)).toBe(
      cssZoomTransform(state, 1280, 720, FULL_CROP),
    );
  });
});

describe("frameSizeFor", () => {
  test("with no crop it is the capture's own size", () => {
    expect(frameSizeFor(1920, 1080, null, "source")).toEqual({ w: 1920, h: 1080 });
  });

  test("cropping in is the same as making the picture bigger", () => {
    // Keep the left half of a 1080p screen: the file comes out 960x1080, so
    // what was half the width now fills the frame at its own resolution.
    expect(frameSizeFor(1920, 1080, { x: 0, y: 0, w: 0.5, h: 1 }, "source")).toEqual({
      w: 960,
      h: 1080,
    });
  });

  test("a chosen shape still wins, measured off the crop", () => {
    expect(frameSizeFor(1920, 1080, { x: 0, y: 0, w: 0.5, h: 1 }, "9:16")).toEqual({
      w: 608,
      h: 1080,
    });
  });

  test("every crop and shape gives an encodable frame", () => {
    for (const crop of [FULL_CROP, { x: 0.1, y: 0.1, w: 0.37, h: 0.53 }, { x: 0, y: 0, w: 1, h: 0.4 }]) {
      for (const preset of ASPECTS) {
        const size = frameSizeFor(1920, 1080, crop, preset.id);
        expect(size.w % 2).toBe(0);
        expect(size.h % 2).toBe(0);
        expect(size.w).toBeGreaterThan(0);
        expect(size.h).toBeGreaterThan(0);
      }
    }
  });
});

describe("what counts as an edit, with a crop", () => {
  test("a crop is an edit even when nothing else changed", () => {
    expect(sceneActive(DEFAULT_FRAME_STYLE, [], FULL_CROP)).toBe(false);
    expect(sceneActive(DEFAULT_FRAME_STYLE, [], null)).toBe(false);
    expect(sceneActive(DEFAULT_FRAME_STYLE, [], { x: 0.1, y: 0, w: 0.8, h: 1 })).toBe(
      true,
    );
  });
});

describe("fitCrop", () => {
  test("no shape means no crop", () => {
    expect(fitCrop(1920, 1080, null)).toEqual(FULL_CROP);
  });

  test("a vertical shape takes a slice out of a wide screen", () => {
    // Rather than stranding the whole desktop in a strip down the middle.
    const crop = fitCrop(1920, 1080, 9 / 16);
    expect(crop.h).toBeCloseTo(1, 6);
    expect(crop.w).toBeCloseTo((9 / 16) / (16 / 9), 6);
    expect(crop.x).toBeCloseTo((1 - crop.w) / 2, 6);
  });

  test("a square one too", () => {
    const crop = fitCrop(1920, 1080, 1);
    expect(crop.h).toBeCloseTo(1, 6);
    expect(crop.w).toBeCloseTo(1080 / 1920, 6);
  });

  test("asking for the shape you already have changes nothing", () => {
    expect(fitCrop(1920, 1080, 16 / 9)).toEqual(FULL_CROP);
  });

  test("a shape wider than the capture takes a band across it", () => {
    const crop = fitCrop(1080, 1920, 16 / 9);
    expect(crop.w).toBeCloseTo(1, 6);
    expect(crop.h).toBeCloseTo((1080 / 1920) / (16 / 9), 6);
    expect(crop.y).toBeCloseTo((1 - crop.h) / 2, 6);
  });

  test("what it produces always fits, and is the shape it was asked for", () => {
    for (const [w, h] of [[1920, 1080], [1280, 720], [1080, 1920], [1600, 1200]]) {
      for (const preset of ASPECTS) {
        const crop = fitCrop(w, h, preset.ratio);
        expect(crop).toEqual(clampCrop(crop));
        if (preset.ratio) {
          const kept = cropPixels(crop, w, h);
          expect(kept.w / kept.h).toBeCloseTo(preset.ratio, 5);
        }
      }
    }
  });

  test("and a shape asked for after it needs no letterbox", () => {
    const crop = fitCrop(1920, 1080, 9 / 16);
    const size = frameSizeFor(1920, 1080, crop, "9:16");
    const kept = cropPixels(crop, 1920, 1080);
    // The picture fills the frame: same shape, so there's nothing to pad out
    // at the sides. What's left is the half-pixel of rounding an odd width to
    // something an encoder will take, not a letterbox.
    const rect = videoRect(size.w, size.h, 0, kept.w, kept.h);
    expect(rect.x).toBeLessThan(1);
    expect(rect.y).toBeLessThan(1);
    expect(size.w - rect.w).toBeLessThan(1);
    expect(size.h - rect.h).toBeLessThan(1);
  });
});
