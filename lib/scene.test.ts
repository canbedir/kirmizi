import { describe, expect, test } from "bun:test";
import {
  ASPECTS,
  DEFAULT_FRAME_STYLE,
  ZOOM_MAX_SCALE,
  aspectById,
  cropRect,
  isDefaultFrame,
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
