import { describe, expect, test } from "bun:test";
import { MAX_PICTURE_EDGE, fitWithin, isSafePictureSrc } from "@/lib/picture";

describe("fitWithin", () => {
  test("shrinks the long edge to the limit and keeps the shape", () => {
    const big = fitWithin(4000, 3000, MAX_PICTURE_EDGE);
    expect(big.w).toBe(MAX_PICTURE_EDGE);
    expect(big.w / big.h).toBeCloseTo(4000 / 3000, 2);

    const tall = fitWithin(3000, 4000, MAX_PICTURE_EDGE);
    expect(tall.h).toBe(MAX_PICTURE_EDGE);
    expect(tall.w / tall.h).toBeCloseTo(3000 / 4000, 2);
  });

  test("leaves a small picture alone rather than blowing it up", () => {
    expect(fitWithin(800, 600, MAX_PICTURE_EDGE)).toEqual({ w: 800, h: 600 });
  });

  test("never returns a zero edge for a picture that has one", () => {
    const sliver = fitWithin(5000, 3, MAX_PICTURE_EDGE);
    expect(sliver.w).toBe(MAX_PICTURE_EDGE);
    expect(sliver.h).toBeGreaterThanOrEqual(1);
  });

  test("nothing in, nothing out", () => {
    expect(fitWithin(0, 0, MAX_PICTURE_EDGE)).toEqual({ w: 0, h: 0 });
  });
});

describe("isSafePictureSrc", () => {
  test("accepts the pictures this app makes", () => {
    for (const type of ["png", "jpeg", "webp"]) {
      expect(isSafePictureSrc(`data:image/${type};base64,AAAA`)).toBe(true);
    }
  });

  test("refuses anything that would fetch, run, or be read as markup", () => {
    // A stored edit naming an address would have the editor reach for it the
    // moment it opened — the one thing this app promises never to do. SVG is
    // refused too: it's a document, not a picture, and we never produce one.
    for (const src of [
      "https://example.com/a.png",
      "http://example.com/a.png",
      "//example.com/a.png",
      "javascript:alert(1)",
      "data:text/html;base64,AAAA",
      "data:image/svg+xml;base64,AAAA",
      "data:image/gif;base64,AAAA",
      " data:image/png;base64,AAAA",
      "",
      42,
      null,
      undefined,
      {},
    ]) {
      expect(isSafePictureSrc(src)).toBe(false);
    }
  });
});
