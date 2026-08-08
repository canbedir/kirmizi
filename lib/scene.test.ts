import { describe, expect, test } from "bun:test";
import {
  ASPECTS,
  BACKGROUND_PRESETS,
  CROP_MIN,
  DEFAULT_FRAME_STYLE,
  FULL_CROP,
  NO_BACKGROUND,
  ZOOM_MAX_SCALE,
  aspectById,
  backgroundCss,
  clampCrop,
  coverRect,
  cropPixels,
  cropRect,
  cssZoomTransform,
  fitCrop,
  frameSizeFor,
  gradientFrom,
  isDefaultFrame,
  isFullCrop,
  outputSize,
  paintBackground,
  presetOf,
  radiusPx,
  sameBackground,
  sceneActive,
  spreadStops,
  videoRect,
  zoomStateAt,
  type Background,
  type ZoomRegion,
} from "@/lib/scene";

const EMBER = BACKGROUND_PRESETS.find((p) => p.id === "ember")!.value;

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
    expect(sceneActive({ ...DEFAULT_FRAME_STYLE, background: EMBER }, [])).toBe(
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

describe("backgrounds", () => {
  test("a preset is an ordinary value, so it can be taken apart", () => {
    // The whole point of holding backgrounds as values: a preset is a
    // starting point, not a name you're stuck inside.
    const ocean = BACKGROUND_PRESETS.find((p) => p.id === "ocean")!.value;
    expect(presetOf(ocean)?.id).toBe("ocean");
    expect(ocean.kind).toBe("linear");

    const turned = { ...(ocean as { kind: "linear"; angle: number; stops: [] }), angle: 90 };
    expect(presetOf(turned)).toBeNull();
  });

  test("css says what the preview will paint", () => {
    expect(backgroundCss(NO_BACKGROUND)).toBe("transparent");
    expect(backgroundCss({ kind: "solid", color: "#16130f" })).toBe("#16130f");
    expect(
      backgroundCss({
        kind: "linear",
        angle: 135,
        stops: [
          { offset: 0, color: "#000000" },
          { offset: 1, color: "#ffffff" },
        ],
      }),
    ).toBe("linear-gradient(135deg, #000000 0%, #ffffff 100%)");
  });

  test("two backgrounds are the same when they'd paint the same", () => {
    const a: Background = {
      kind: "linear",
      angle: 90,
      stops: [
        { offset: 0, color: "#111111" },
        { offset: 1, color: "#222222" },
      ],
    };
    expect(sameBackground(a, { ...a, stops: [...a.stops] })).toBe(true);
    expect(sameBackground(a, { ...a, angle: 91 })).toBe(false);
    expect(sameBackground(a, NO_BACKGROUND)).toBe(false);
    expect(sameBackground(NO_BACKGROUND, NO_BACKGROUND)).toBe(true);
    expect(
      sameBackground(a, { kind: "solid", color: "#111111" }),
    ).toBe(false);
  });

  test("one colour becomes a gradient into a darker version of itself", () => {
    const bg = gradientFrom("#3080c0");
    expect(bg.kind).toBe("linear");
    if (bg.kind !== "linear") throw new Error("unreachable");
    expect(bg.stops.length).toBe(2);
    expect(bg.stops[0].color).toBe("#3080c0");
    expect(bg.stops[0].offset).toBe(0);
    expect(bg.stops[1].offset).toBe(1);
    expect(bg.stops[1].color).not.toBe(bg.stops[0].color);
  });

  test("spreading stops puts the ends where a gradient's ends belong", () => {
    const spread = spreadStops([
      { offset: 0.3, color: "#000000" },
      { offset: 0.4, color: "#888888" },
      { offset: 0.9, color: "#ffffff" },
    ]);
    expect(spread.map((s) => s.offset)).toEqual([0, 0.5, 1]);
    expect(spread.map((s) => s.color)).toEqual(["#000000", "#888888", "#ffffff"]);
  });

  test("a background is what makes a frame worth re-encoding", () => {
    expect(isDefaultFrame({ ...DEFAULT_FRAME_STYLE, background: NO_BACKGROUND })).toBe(
      true,
    );
    expect(
      isDefaultFrame({
        ...DEFAULT_FRAME_STYLE,
        background: { kind: "solid", color: "#000000" },
      }),
    ).toBe(false);
  });
});

describe("painting a background the way CSS would", () => {
  // The preview is a CSS gradient and the export is a canvas one. They only
  // agree if the canvas puts the gradient line exactly where CSS defines it:
  // through the centre, at the given angle, long enough that its ends are
  // where the first and last colours land.
  function recorder() {
    const calls = {
      gradients: [] as number[][],
      stops: [] as [number, string][],
      fills: [] as number[],
      fillStyle: null as unknown,
    };
    const ctx = {
      createLinearGradient(x0: number, y0: number, x1: number, y1: number) {
        calls.gradients.push([x0, y0, x1, y1]);
        return {
          addColorStop: (offset: number, color: string) =>
            calls.stops.push([offset, color]),
        };
      },
      fillRect(x: number, y: number, w: number, h: number) {
        calls.fills.push(x, y, w, h);
      },
      set fillStyle(value: unknown) {
        calls.fillStyle = value;
      },
    };
    return { ctx: ctx as unknown as Parameters<typeof paintBackground>[0], calls };
  }

  const ramp = (angle: number): Background => ({
    kind: "linear",
    angle,
    stops: [
      { offset: 0, color: "#000000" },
      { offset: 1, color: "#ffffff" },
    ],
  });

  test("0deg runs bottom to top, as CSS does", () => {
    const { ctx, calls } = recorder();
    paintBackground(ctx, ramp(0), 200, 100);
    expect(calls.gradients[0].map((v) => Math.round(v) || 0)).toEqual([100, 100, 100, 0]);
  });

  test("90deg runs left to right", () => {
    const { ctx, calls } = recorder();
    paintBackground(ctx, ramp(90), 200, 100);
    expect(calls.gradients[0].map((v) => Math.round(v) || 0)).toEqual([0, 50, 200, 50]);
  });

  test("180deg runs top to bottom", () => {
    const { ctx, calls } = recorder();
    paintBackground(ctx, ramp(180), 200, 100);
    expect(calls.gradients[0].map((v) => Math.round(v) || 0)).toEqual([100, 0, 100, 100]);
  });

  test("on a square, 135deg lands exactly on the corners", () => {
    // The case that catches a sign error or a half-length mistake: CSS puts
    // the ends of a 135deg gradient on the corners of a square, nowhere else.
    const { ctx, calls } = recorder();
    paintBackground(ctx, ramp(135), 100, 100);
    expect(calls.gradients[0].map((v) => Math.round(v) || 0)).toEqual([0, 0, 100, 100]);
  });

  test("the line is long enough to reach past the corners of a wide frame", () => {
    // CSS defines the length as |W·sinA| + |H·cosA|.
    const { ctx, calls } = recorder();
    paintBackground(ctx, ramp(135), 1920, 1080);
    const [x0, y0, x1, y1] = calls.gradients[0];
    const spec =
      Math.abs(1920 * Math.sin((135 * Math.PI) / 180)) +
      Math.abs(1080 * Math.cos((135 * Math.PI) / 180));
    expect(Math.hypot(x1 - x0, y1 - y0)).toBeCloseTo(spec, 6);
    // ...and centred on the frame, so neither end runs long.
    expect((x0 + x1) / 2).toBeCloseTo(960, 6);
    expect((y0 + y1) / 2).toBeCloseTo(540, 6);
  });

  test("every colour reaches the canvas, at the offset it was given", () => {
    const { ctx, calls } = recorder();
    paintBackground(ctx, BACKGROUND_PRESETS.find((p) => p.id === "ember")!.value, 100, 100);
    expect(calls.stops).toEqual([
      [0, "#3d100b"],
      [0.55, "#7c241c"],
      [1, "#1a0c0a"],
    ]);
    expect(calls.fills).toEqual([0, 0, 100, 100]);
  });

  test("a flat colour covers the frame and nothing else happens", () => {
    const { ctx, calls } = recorder();
    paintBackground(ctx, { kind: "solid", color: "#16130f" }, 640, 360);
    expect(calls.fillStyle).toBe("#16130f");
    expect(calls.fills).toEqual([0, 0, 640, 360]);
    expect(calls.gradients).toEqual([]);
  });

  test("no background paints nothing at all", () => {
    const { ctx, calls } = recorder();
    paintBackground(ctx, NO_BACKGROUND, 640, 360);
    expect(calls.fills).toEqual([]);
    expect(calls.gradients).toEqual([]);
  });
});

describe("a picture as the background", () => {
  const PIC = "data:image/jpeg;base64,AAAA";
  const bg: Background = { kind: "image", src: PIC };

  test("the preview covers the frame with it, on black", () => {
    // Black underneath so a picture that hasn't decoded leaves a frame that's
    // deliberately empty rather than see-through.
    expect(backgroundCss(bg)).toBe(`#000 url("${PIC}") center / cover no-repeat`);
  });

  test("two are the same when they're the same picture", () => {
    expect(sameBackground(bg, { kind: "image", src: PIC })).toBe(true);
    expect(sameBackground(bg, { kind: "image", src: "data:image/png;base64,B" })).toBe(
      false,
    );
    expect(sameBackground(bg, NO_BACKGROUND)).toBe(false);
    expect(presetOf(bg)).toBeNull();
  });

  test("a picture is a frame worth re-encoding for", () => {
    expect(isDefaultFrame({ ...DEFAULT_FRAME_STYLE, background: bg })).toBe(false);
  });
});

describe("coverRect", () => {
  test("a wide picture in a square frame overflows sideways, evenly", () => {
    const at = coverRect(1920, 1080, 1000, 1000);
    expect(at.h).toBeCloseTo(1000, 6);
    expect(at.w).toBeCloseTo(1000 * (1920 / 1080), 6);
    expect(at.y).toBeCloseTo(0, 6);
    // Whatever spills over is shared between the two sides.
    expect(at.x).toBeCloseTo((1000 - at.w) / 2, 6);
  });

  test("a tall picture in a wide frame overflows up and down", () => {
    const at = coverRect(1080, 1920, 1920, 1080);
    expect(at.w).toBeCloseTo(1920, 6);
    expect(at.x).toBeCloseTo(0, 6);
    expect(at.y).toBeCloseTo((1080 - at.h) / 2, 6);
  });

  test("the frame is always covered, whatever the shapes", () => {
    for (const [sw, sh] of [[1920, 1080], [1080, 1920], [100, 100], [3000, 200]]) {
      for (const [dw, dh] of [[1920, 1080], [1080, 1920], [800, 800]]) {
        const at = coverRect(sw, sh, dw, dh);
        expect(at.w).toBeGreaterThanOrEqual(dw - 1e-6);
        expect(at.h).toBeGreaterThanOrEqual(dh - 1e-6);
        expect(at.x).toBeLessThanOrEqual(1e-6);
        expect(at.y).toBeLessThanOrEqual(1e-6);
      }
    }
  });

  test("a picture with no size doesn't produce a broken rect", () => {
    expect(coverRect(0, 0, 640, 360)).toEqual({ x: 0, y: 0, w: 640, h: 360 });
  });
});
