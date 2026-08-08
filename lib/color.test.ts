import { describe, expect, test } from "bun:test";
import {
  formatHex,
  hsvToRgb,
  isLight,
  luminance,
  palette,
  parseHex,
  rgbToHsv,
  shade,
} from "@/lib/color";

/** RGBA pixels from a list of colours, each repeated `times`. */
function pixels(spec: [string, number][]): Uint8ClampedArray {
  const out: number[] = [];
  for (const [hex, times] of spec) {
    const rgb = parseHex(hex)!;
    for (let i = 0; i < times; i++) out.push(rgb.r, rgb.g, rgb.b, 255);
  }
  return new Uint8ClampedArray(out);
}

describe("parseHex", () => {
  test("reads the four forms people actually paste", () => {
    const want = { r: 0xaa, g: 0xbb, b: 0xcc };
    expect(parseHex("#aabbcc")).toEqual(want);
    expect(parseHex("aabbcc")).toEqual(want);
    expect(parseHex("#abc")).toEqual(want);
    expect(parseHex("  #AABBCC  ")).toEqual(want);
  });

  test("refuses what it can't read instead of guessing", () => {
    expect(parseHex("")).toBeNull();
    expect(parseHex("#ab")).toBeNull();
    expect(parseHex("#abcde")).toBeNull();
    expect(parseHex("#gghhii")).toBeNull();
    expect(parseHex("rgb(1,2,3)")).toBeNull();
  });
});

describe("formatHex", () => {
  test("pads and clamps", () => {
    expect(formatHex({ r: 0, g: 0, b: 0 })).toBe("#000000");
    expect(formatHex({ r: 1, g: 2, b: 3 })).toBe("#010203");
    expect(formatHex({ r: 300, g: -5, b: 255 })).toBe("#ff00ff");
  });
});

describe("hsv", () => {
  test("the primaries land where they should", () => {
    expect(rgbToHsv({ r: 255, g: 0, b: 0 })).toEqual({ h: 0, s: 1, v: 1 });
    expect(rgbToHsv({ r: 0, g: 255, b: 0 })).toEqual({ h: 120, s: 1, v: 1 });
    expect(rgbToHsv({ r: 0, g: 0, b: 255 })).toEqual({ h: 240, s: 1, v: 1 });
  });

  test("grey has no hue and no saturation", () => {
    const hsv = rgbToHsv({ r: 128, g: 128, b: 128 });
    expect(hsv.s).toBe(0);
    expect(hsv.h).toBe(0);
    expect(hsv.v).toBeCloseTo(128 / 255, 6);
  });

  test("a colour survives the round trip", () => {
    // Every hex the picker can produce has to come back unchanged, or a
    // colour would drift each time the panel re-read it.
    for (const hex of [
      "#000000", "#ffffff", "#7c241c", "#0f2027", "#f8b500",
      "#123456", "#abcdef", "#ff00ff", "#00ff88", "#3d100b",
    ]) {
      const rgb = parseHex(hex)!;
      expect(formatHex(hsvToRgb(rgbToHsv(rgb)))).toBe(hex);
    }
  });

  test("hue wraps rather than clipping", () => {
    expect(hsvToRgb({ h: 360, s: 1, v: 1 })).toEqual(hsvToRgb({ h: 0, s: 1, v: 1 }));
    expect(hsvToRgb({ h: -60, s: 1, v: 1 })).toEqual(hsvToRgb({ h: 300, s: 1, v: 1 }));
  });
});

describe("luminance", () => {
  test("black to white", () => {
    expect(luminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 6);
    expect(luminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 6);
  });

  test("tells a swatch that needs dark markings from one that needs light", () => {
    expect(isLight("#f5f1e8")).toBe(true);
    expect(isLight("#e9e4d8")).toBe(true);
    expect(isLight("#16130f")).toBe(false);
    expect(isLight("#3d100b")).toBe(false);
    expect(isLight("not a colour")).toBe(false);
  });
});

describe("shade", () => {
  test("darkens without moving the hue", () => {
    const darker = shade("#3080c0", 0.4);
    expect(rgbToHsv(parseHex(darker)!).h).toBeCloseTo(
      rgbToHsv(parseHex("#3080c0")!).h,
      0,
    );
    expect(luminance(parseHex(darker)!)).toBeLessThan(
      luminance(parseHex("#3080c0")!),
    );
  });

  test("leaves something it can't read alone", () => {
    expect(shade("nope", 0.5)).toBe("nope");
  });
});

describe("palette", () => {
  test("finds what the picture is made of, most common first", () => {
    const found = palette(pixels([["#ff0000", 50], ["#0000ff", 20]]), 4);
    expect(found).toEqual(["#ff0000", "#0000ff"]);
  });

  test("collapses near-identical colours into one", () => {
    // A gradient of blues is one colour as far as a background is concerned.
    const found = palette(
      pixels([["#3050a0", 40], ["#3252a2", 30], ["#3454a4", 20], ["#ffcc00", 5]]),
      5,
    );
    expect(found.length).toBe(2);
    expect(found[1]).toBe("#ffcc00");
  });

  test("returns a colour that was really in the picture", () => {
    // Bucket midpoints would answer #f8f8f8 or similar; the average of what
    // actually landed there is the honest reply.
    const found = palette(pixels([["#f0f2f4", 10]]), 1);
    expect(found).toEqual(["#f0f2f4"]);
  });

  test("never returns more than asked for", () => {
    const found = palette(
      pixels([
        ["#ff0000", 9], ["#00ff00", 8], ["#0000ff", 7],
        ["#ffff00", 6], ["#ff00ff", 5], ["#00ffff", 4],
      ]),
      3,
    );
    expect(found.length).toBe(3);
  });

  test("ignores transparent pixels and empty input", () => {
    expect(palette(new Uint8ClampedArray([255, 0, 0, 0]), 3)).toEqual([]);
    expect(palette(new Uint8ClampedArray([]), 3)).toEqual([]);
    expect(palette(pixels([["#ff0000", 4]]), 0)).toEqual([]);
  });
});
