import { describe, expect, test } from "bun:test";
import {
  ANNOTATION_MAX_SIZE,
  ANNOTATION_MIN_LENGTH,
  ANNOTATION_MIN_SIZE,
  annotationsAt,
  clampAnnotation,
  handlesOf,
  moveAnnotation,
  moveHandle,
  newAnnotation,
  rectOf,
  type Annotation,
} from "@/lib/annotate";

const make = (extra: Partial<Annotation> = {}): Annotation => ({
  id: "a",
  kind: "box",
  start: 2,
  end: 6,
  x: 0.2,
  y: 0.3,
  x2: 0.6,
  y2: 0.8,
  text: "",
  size: 0.05,
  color: "#f62d22",
  ...extra,
});

describe("newAnnotation", () => {
  test("is laid around the playhead, not from it", () => {
    // A mark starting exactly at the playhead would be at the very start of
    // its own fade — invisible on the one frame you are looking at.
    const a = newAnnotation("text", 4, 30);
    expect((a.start + a.end) / 2).toBeCloseTo(4, 6);
    expect(a.end - a.start).toBeGreaterThanOrEqual(ANNOTATION_MIN_LENGTH);
    expect(a.end).toBeLessThanOrEqual(30);
  });

  test("is pushed inside the clip at either end of it", () => {
    const atStart = newAnnotation("box", 0, 30);
    expect(atStart.start).toBe(0);
    expect(atStart.end).toBeGreaterThan(0);
    const atEnd = newAnnotation("box", 30, 30);
    expect(atEnd.end).toBeLessThanOrEqual(30);
    expect(atEnd.start).toBeGreaterThanOrEqual(0);
  });

  test("a clip shorter than the default length still gets a mark", () => {
    const a = newAnnotation("arrow", 0.5, 1);
    expect(a.start).toBeGreaterThanOrEqual(0);
    expect(a.end).toBeLessThanOrEqual(1);
    expect(a.end - a.start).toBeGreaterThanOrEqual(ANNOTATION_MIN_LENGTH);
  });

  test("still fits when there's barely any clip left", () => {
    // Added with the playhead at the very end: it has to go somewhere real.
    const a = newAnnotation("arrow", 9.9, 10);
    expect(a.start).toBeLessThanOrEqual(10 - ANNOTATION_MIN_LENGTH);
    expect(a.end).toBeGreaterThan(a.start);
  });

  test("each kind arrives as something you can already see", () => {
    for (const kind of ["text", "arrow", "box"] as const) {
      const a = newAnnotation(kind, 1, 20);
      expect(a.kind).toBe(kind);
      for (const v of [a.x, a.y, a.x2, a.y2]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
    // An arrow and a box need two points that aren't the same point.
    const arrow = newAnnotation("arrow", 1, 20);
    expect(Math.hypot(arrow.x2 - arrow.x, arrow.y2 - arrow.y)).toBeGreaterThan(0.1);
    expect(newAnnotation("text", 1, 20).text.length).toBeGreaterThan(0);
  });

  test("ids don't collide", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 200; i++) ids.add(newAnnotation("box", 1, 20).id);
    expect(ids.size).toBe(200);
  });
});

describe("annotationsAt", () => {
  test("isn't there before it starts or after it ends", () => {
    const list = [make()];
    expect(annotationsAt(list, 1.9)).toEqual([]);
    expect(annotationsAt(list, 6.1)).toEqual([]);
  });

  test("is fully there through the middle", () => {
    expect(annotationsAt([make()], 4)[0].opacity).toBe(1);
  });

  test("arrives and leaves rather than blinking on", () => {
    const list = [make()];
    const arriving = annotationsAt(list, 2.05)[0].opacity;
    expect(arriving).toBeGreaterThan(0);
    expect(arriving).toBeLessThan(1);
    const leaving = annotationsAt(list, 5.95)[0].opacity;
    expect(leaving).toBeGreaterThan(0);
    expect(leaving).toBeLessThan(1);
  });

  test("a very short one still reaches full strength", () => {
    // The fade is capped at a third of the run, so even the shortest
    // annotation is solid for the middle of it rather than only ever ramping.
    const brief = make({ start: 0, end: ANNOTATION_MIN_LENGTH });
    expect(annotationsAt([brief], ANNOTATION_MIN_LENGTH / 2)[0].opacity).toBe(1);
  });

  test("opacity never leaves 0..1, wherever you look", () => {
    const list = [make({ start: 0, end: 0.5 }), make({ id: "b", start: 1, end: 9 })];
    for (let t = -1; t <= 11; t += 0.01) {
      for (const shown of annotationsAt(list, t)) {
        expect(shown.opacity).toBeGreaterThanOrEqual(0);
        expect(shown.opacity).toBeLessThanOrEqual(1);
      }
    }
  });

  test("comes back in the order they were added, which is the order drawn", () => {
    const list = [make({ id: "first" }), make({ id: "second" })];
    expect(annotationsAt(list, 4).map((s) => s.annotation.id)).toEqual([
      "first",
      "second",
    ]);
  });
});

describe("clampAnnotation", () => {
  test("keeps a region inside the clip and long enough to see", () => {
    const a = clampAnnotation(make({ start: -5, end: -1 }), 10);
    expect(a.start).toBe(0);
    expect(a.end - a.start).toBeGreaterThanOrEqual(ANNOTATION_MIN_LENGTH);
  });

  test("holds the size to what the panel offers", () => {
    expect(clampAnnotation(make({ size: 99 }), 10).size).toBe(ANNOTATION_MAX_SIZE);
    expect(clampAnnotation(make({ size: 0 }), 10).size).toBe(ANNOTATION_MIN_SIZE);
  });

  test("lets a point sit off the edge, but not out of reach", () => {
    // An arrow flying in from outside the picture is a fair thing to want.
    const a = clampAnnotation(make({ x: -0.1, y: 1.1, x2: -9, y2: 9 }), 10);
    expect(a.x).toBeCloseTo(-0.1, 6);
    expect(a.y).toBeCloseTo(1.1, 6);
    expect(a.x2).toBe(-0.25);
    expect(a.y2).toBe(1.25);
  });
});

describe("moving things", () => {
  test("moving carries both points, so the shape doesn't stretch", () => {
    const moved = moveAnnotation(make(), 0.1, -0.05);
    expect(moved.x).toBeCloseTo(0.3, 6);
    expect(moved.x2).toBeCloseTo(0.7, 6);
    expect(moved.y).toBeCloseTo(0.25, 6);
    expect(moved.y2).toBeCloseTo(0.75, 6);
  });

  test("a handle moves alone", () => {
    const a = moveHandle(make(), 1, 0.9, 0.9);
    expect([a.x, a.y]).toEqual([0.2, 0.3]);
    expect([a.x2, a.y2]).toEqual([0.9, 0.9]);
  });

  test("text has one point, and both fields follow it", () => {
    // Text hangs off its anchor; letting the two drift apart would leave a
    // second handle somewhere with nothing to grab.
    const a = moveHandle(make({ kind: "text" }), 0, 0.4, 0.5);
    expect([a.x, a.y, a.x2, a.y2]).toEqual([0.4, 0.5, 0.4, 0.5]);
    expect(handlesOf(a).length).toBe(1);
    expect(handlesOf(make({ kind: "arrow" })).length).toBe(2);
    expect(handlesOf(make({ kind: "box" })).length).toBe(2);
  });
});

describe("rectOf", () => {
  test("is the same box whichever corner was dragged", () => {
    const same = (r: ReturnType<typeof rectOf>) => {
      expect(r.x).toBeCloseTo(0.2, 9);
      expect(r.y).toBeCloseTo(0.3, 9);
      expect(r.w).toBeCloseTo(0.4, 9);
      expect(r.h).toBeCloseTo(0.5, 9);
    };
    same(rectOf(make()));
    same(rectOf(make({ x: 0.6, y: 0.8, x2: 0.2, y2: 0.3 })));
  });

  test("a box dragged to nothing has no size rather than a negative one", () => {
    const flat = rectOf(make({ x2: 0.2, y2: 0.3 }));
    expect(flat.w).toBe(0);
    expect(flat.h).toBe(0);
  });
});
