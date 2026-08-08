// Colour arithmetic for the background picker.
//
// Kept apart from the UI because it's the part that can be wrong in ways you
// can't see: a hue that drifts on the way to a hex string and back, or a
// palette that returns five shades of the same blue.

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Hsv {
  /** Degrees, 0–360. */
  h: number;
  /** 0–1. */
  s: number;
  /** 0–1. */
  v: number;
}

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

const byte = (v: number) => clamp(Math.round(v), 0, 255);

/**
 * Read a hex colour. Accepts `#abc`, `abc`, `#aabbcc` and `aabbcc`, because
 * those are the four things people paste, and returns null for anything else
 * rather than guessing.
 */
export function parseHex(input: string): Rgb | null {
  const text = input.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]+$/.test(text)) return null;
  if (text.length === 3) {
    return {
      r: parseInt(text[0] + text[0], 16),
      g: parseInt(text[1] + text[1], 16),
      b: parseInt(text[2] + text[2], 16),
    };
  }
  if (text.length === 6) {
    return {
      r: parseInt(text.slice(0, 2), 16),
      g: parseInt(text.slice(2, 4), 16),
      b: parseInt(text.slice(4, 6), 16),
    };
  }
  return null;
}

export function formatHex({ r, g, b }: Rgb): string {
  const hex = (v: number) => byte(v).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

export function rgbToHsv({ r, g, b }: Rgb): Hsv {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const span = max - min;

  let h = 0;
  if (span > 0) {
    if (max === rn) h = ((gn - bn) / span) % 6;
    else if (max === gn) h = (bn - rn) / span + 2;
    else h = (rn - gn) / span + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : span / max, v: max };
}

export function hsvToRgb({ h, s, v }: Hsv): Rgb {
  const hue = ((h % 360) + 360) % 360;
  const sat = clamp(s, 0, 1);
  const val = clamp(v, 0, 1);
  const c = val * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = val - c;
  const sector = Math.floor(hue / 60) % 6;
  const [r, g, b] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ][sector];
  return { r: byte((r + m) * 255), g: byte((g + m) * 255), b: byte((b + m) * 255) };
}

/**
 * Relative luminance, per WCAG. Used to decide whether a swatch needs dark or
 * light markings drawn on it.
 */
export function luminance({ r, g, b }: Rgb): number {
  const channel = (v: number) => {
    const n = v / 255;
    return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Whether markings on this colour should be dark rather than light. */
export function isLight(color: string): boolean {
  const rgb = parseHex(color);
  return rgb ? luminance(rgb) > 0.4 : false;
}

/** A colour the same hue but darkened, for building a gradient from one pick. */
export function shade(color: string, amount: number): string {
  const rgb = parseHex(color);
  if (!rgb) return color;
  const hsv = rgbToHsv(rgb);
  return formatHex(
    hsvToRgb({ h: hsv.h, s: hsv.s, v: clamp(hsv.v * (1 - amount), 0, 1) }),
  );
}

/** A colour `t` of the way from `a` to `b`. */
export function mix(a: string, b: string, t: number): string {
  const from = parseHex(a);
  const to = parseHex(b);
  if (!from || !to) return a;
  const at = clamp(t, 0, 1);
  return formatHex({
    r: from.r + (to.r - from.r) * at,
    g: from.g + (to.g - from.g) * at,
    b: from.b + (to.b - from.b) * at,
  });
}

/* ---------------------------------------------------------------- */
/* Palette                                                           */
/* ---------------------------------------------------------------- */

/** Colours closer together than this count as the same one. */
const MIN_SEPARATION = 60;

function distance(a: Rgb, b: Rgb): number {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

/**
 * The colours a picture is actually made of, most common first.
 *
 * Channels are quantised to sixteen levels so near-identical pixels land in
 * one bucket, each bucket reports the average of what fell into it — so the
 * answer is a colour that was really there, not a bucket's midpoint — and
 * anything too close to a colour already chosen is passed over. Without that
 * last step a screenshot returns five greys and calls them a palette.
 */
export function palette(pixels: Uint8ClampedArray, count: number): string[] {
  if (count <= 0) return [];
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();

  for (let i = 0; i + 3 < pixels.length; i += 4) {
    // Transparent pixels are nothing to sample; a video frame has none, but a
    // canvas that failed to draw is all of them.
    if (pixels[i + 3] < 128) continue;
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.n++;
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
    } else {
      buckets.set(key, { n: 1, r, g, b });
    }
  }

  const ranked = [...buckets.values()]
    .sort((a, b) => b.n - a.n)
    .map((bucket) => ({
      r: bucket.r / bucket.n,
      g: bucket.g / bucket.n,
      b: bucket.b / bucket.n,
    }));

  const chosen: Rgb[] = [];
  for (const colour of ranked) {
    if (chosen.length >= count) break;
    if (chosen.every((taken) => distance(taken, colour) >= MIN_SEPARATION)) {
      chosen.push(colour);
    }
  }
  return chosen.map(formatHex);
}
