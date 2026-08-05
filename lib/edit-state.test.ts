import { describe, expect, test } from "bun:test";
import {
  isUntouched,
  packEdits,
  readEdits,
  type EditSnapshot,
} from "@/lib/edit-state";
import { DEFAULT_CURSOR_STYLE } from "@/lib/cursor-track";
import { DEFAULT_FRAME_STYLE, FULL_CROP } from "@/lib/scene";
import { DEFAULT_SOUND_STYLE } from "@/lib/sound";

const D = 12;

const snapshot = (extra: Partial<EditSnapshot> = {}): EditSnapshot => ({
  duration: D,
  segments: [{ id: "a", start: 0, end: D, muted: false, speed: 1 }],
  zooms: [],
  frame: DEFAULT_FRAME_STYLE,
  crop: FULL_CROP,
  cursor: DEFAULT_CURSOR_STYLE,
  sound: DEFAULT_SOUND_STYLE,
  camera: null,
  ...extra,
});

const DEFAULTS = {
  frame: DEFAULT_FRAME_STYLE,
  cursor: DEFAULT_CURSOR_STYLE,
  sound: DEFAULT_SOUND_STYLE,
};

describe("a round trip", () => {
  test("comes back as it went in", () => {
    const before = snapshot({
      segments: [
        { id: "a", start: 0, end: 4, muted: true, speed: 2 },
        { id: "b", start: 7, end: D, muted: false, speed: 1 },
      ],
      zooms: [{ id: "z", start: 1, end: 3, x: 0.4, y: 0.6, scale: 2.2, auto: true }],
      frame: { ...DEFAULT_FRAME_STYLE, background: "ember", aspect: "9:16" },
      sound: { normalise: false, rumble: true },
    });
    const after = readEdits(packEdits(before), D);
    expect(after).not.toBeNull();
    expect(after!.segments).toEqual(before.segments);
    expect(after!.zooms).toEqual(before.zooms);
    expect(after!.frame).toEqual(before.frame);
    expect(after!.sound).toEqual(before.sound);
  });

  test("carries the camera when there was one", () => {
    const camera = {
      layout: { x: 0.8, y: 0.8, size: 0.3, shape: "circle" as const, mirror: true, borderColor: "#fff", borderWidth: 0.01 },
      hidden: true,
    };
    const after = readEdits(packEdits(snapshot({ camera })), D);
    expect(after!.camera?.hidden).toBe(true);
    expect(after!.camera?.layout.x).toBeCloseTo(0.8, 6);
  });
});

describe("refusing what it can't trust", () => {
  test("nothing at all", () => {
    expect(readEdits(null, D)).toBeNull();
    expect(readEdits(undefined, D)).toBeNull();
    expect(readEdits("nonsense", D)).toBeNull();
    expect(readEdits(42, D)).toBeNull();
    expect(readEdits([], D)).toBeNull();
  });

  test("a record written by a version that read differently", () => {
    const stored = { ...packEdits(snapshot()), version: 99 };
    expect(readEdits(stored, D)).toBeNull();
  });

  test("no segments to speak of", () => {
    expect(readEdits({ ...packEdits(snapshot()), segments: [] }, D)).toBeNull();
    expect(readEdits({ ...packEdits(snapshot()), segments: "no" }, D)).toBeNull();
    expect(readEdits({ ...packEdits(snapshot()), segments: [null] }, D)).toBeNull();
  });

  test("a cut that doesn't fit the clip it's loaded into", () => {
    // These edits belong to a different, longer recording.
    const stored = packEdits(
      snapshot({ segments: [{ id: "a", start: 0, end: 30, muted: false, speed: 1 }] }),
    );
    expect(readEdits(stored, D)).toBeNull();
  });

  test("a segment that ends before it starts", () => {
    const stored = packEdits(
      snapshot({ segments: [{ id: "a", start: 5, end: 2, muted: false, speed: 1 }] }),
    );
    expect(readEdits(stored, D)).toBeNull();
  });

  test("a clip with no length", () => {
    expect(readEdits(packEdits(snapshot()), 0)).toBeNull();
  });
});

describe("filling in what's missing", () => {
  test("a style saved before a field existed gets today's default", () => {
    const stored = packEdits(snapshot()) as unknown as Record<string, unknown>;
    stored.frame = { background: "ember" }; // no padding, radius, shadow, aspect
    const after = readEdits(stored, D);
    expect(after!.frame.background).toBe("ember");
    expect(after!.frame.aspect).toBe(DEFAULT_FRAME_STYLE.aspect);
    expect(after!.frame.padding).toBe(DEFAULT_FRAME_STYLE.padding);
  });

  test("a malformed style is replaced wholesale rather than half-read", () => {
    const stored = packEdits(snapshot()) as unknown as Record<string, unknown>;
    stored.sound = "broken";
    expect(readEdits(stored, D)!.sound).toEqual(DEFAULT_SOUND_STYLE);
  });

  test("a zoom outside the clip is dropped, the rest are kept", () => {
    const stored = packEdits(
      snapshot({
        zooms: [
          { id: "keep", start: 1, end: 3, x: 0.5, y: 0.5, scale: 2 },
          { id: "gone", start: 50, end: 60, x: 0.5, y: 0.5, scale: 2 },
        ],
      }),
    );
    const after = readEdits(stored, D);
    expect(after!.zooms.map((z) => z.id)).toEqual(["keep"]);
  });

  test("a zoom running past the end is trimmed to it", () => {
    const stored = packEdits(
      snapshot({ zooms: [{ id: "z", start: 10, end: 40, x: 0.5, y: 0.5, scale: 2 }] }),
    );
    expect(readEdits(stored, D)!.zooms[0].end).toBe(D);
  });

  test("segments come back in order whatever order they were stored in", () => {
    const stored = packEdits(
      snapshot({
        segments: [
          { id: "b", start: 7, end: D, muted: false, speed: 1 },
          { id: "a", start: 0, end: 4, muted: false, speed: 1 },
        ],
      }),
    );
    expect(readEdits(stored, D)!.segments.map((s) => s.id)).toEqual(["a", "b"]);
  });
});

describe("what isn't worth remembering", () => {
  test("an untouched clip", () => {
    expect(isUntouched(snapshot(), DEFAULTS)).toBe(true);
  });

  test("but a cut is", () => {
    const cut = snapshot({
      segments: [{ id: "a", start: 0, end: 5, muted: false, speed: 1 }],
    });
    expect(isUntouched(cut, DEFAULTS)).toBe(false);
  });

  test("and so is a mute, a speed change, a background or a shape", () => {
    expect(
      isUntouched(
        snapshot({ segments: [{ id: "a", start: 0, end: D, muted: true, speed: 1 }] }),
        DEFAULTS,
      ),
    ).toBe(false);
    expect(
      isUntouched(
        snapshot({ segments: [{ id: "a", start: 0, end: D, muted: false, speed: 2 }] }),
        DEFAULTS,
      ),
    ).toBe(false);
    expect(
      isUntouched(
        snapshot({ frame: { ...DEFAULT_FRAME_STYLE, background: "ember" } }),
        DEFAULTS,
      ),
    ).toBe(false);
    expect(
      isUntouched(
        snapshot({ frame: { ...DEFAULT_FRAME_STYLE, aspect: "1:1" } }),
        DEFAULTS,
      ),
    ).toBe(false);
  });

  test("a zoom the editor proposed itself isn't the user's work", () => {
    const auto = snapshot({
      zooms: [{ id: "z", start: 1, end: 3, x: 0.5, y: 0.5, scale: 2, auto: true }],
    });
    expect(isUntouched(auto, DEFAULTS)).toBe(true);
  });

  test("but one placed by hand is", () => {
    const manual = snapshot({
      zooms: [{ id: "z", start: 1, end: 3, x: 0.5, y: 0.5, scale: 2 }],
    });
    expect(isUntouched(manual, DEFAULTS)).toBe(false);
  });
});

describe("the crop travels too", () => {
  const half = { x: 0.25, y: 0.1, w: 0.5, h: 0.6 };

  test("comes back as it went in", () => {
    const after = readEdits(packEdits(snapshot({ crop: half })), D);
    expect(after!.crop.x).toBeCloseTo(half.x, 6);
    expect(after!.crop.w).toBeCloseTo(half.w, 6);
    expect(after!.crop.h).toBeCloseTo(half.h, 6);
  });

  test("an edit saved before crops existed keeps the whole screen", () => {
    const stored = packEdits(snapshot()) as unknown as Record<string, unknown>;
    delete stored.crop;
    expect(readEdits(stored, D)!.crop).toEqual(FULL_CROP);
  });

  test("a nonsense crop is not trusted", () => {
    const stored = packEdits(snapshot()) as unknown as Record<string, unknown>;
    stored.crop = { x: -5, y: "no", w: 99, h: null };
    const crop = readEdits(stored, D)!.crop;
    expect(crop.x).toBeGreaterThanOrEqual(0);
    expect(crop.x + crop.w).toBeLessThanOrEqual(1 + 1e-9);
    expect(crop.y + crop.h).toBeLessThanOrEqual(1 + 1e-9);
  });

  test("and a crop counts as work worth remembering", () => {
    expect(isUntouched(snapshot({ crop: half }), DEFAULTS)).toBe(false);
    expect(isUntouched(snapshot({ crop: FULL_CROP }), DEFAULTS)).toBe(true);
  });
});
