// Things drawn on top of the recording that were never on the screen: a label,
// an arrow, a box around the thing you're talking about.
//
// An annotation is a timed region, like a zoom — it has a start and an end on
// the source clip and is simply not there outside them. Its position is in
// the capture's own coordinates rather than the frame's, so it travels with
// whatever it was put next to: crop the shot, reframe it, push a zoom in, and
// the arrow still points at the button. That's the same rule the click effects
// follow, and for the same reason.
//
// Size is the exception, deliberately. A label scaled by a 3× zoom would be
// three times too big; it keeps a constant size on screen instead.

export type AnnotationKind = "text" | "arrow" | "box";

export interface Annotation {
  id: string;
  kind: AnnotationKind;
  /** Source seconds. */
  start: number;
  end: number;
  /**
   * First point, as fractions of the capture. Where the text sits, where an
   * arrow comes from, one corner of a box.
   */
  x: number;
  y: number;
  /**
   * Second point. Where an arrow points, the opposite corner of a box.
   * Carried by text too so dragging code doesn't have to ask what kind it is.
   */
  x2: number;
  y2: number;
  text: string;
  /** Text size, and stroke weight, as a fraction of the frame's height. */
  size: number;
  color: string;
}

export const ANNOTATION_MIN_LENGTH = 0.4;
export const ANNOTATION_DEFAULT_LENGTH = 3;
export const ANNOTATION_MIN_SIZE = 0.02;
export const ANNOTATION_MAX_SIZE = 0.14;
export const DEFAULT_ANNOTATION_SIZE = 0.05;
export const DEFAULT_ANNOTATION_COLOR = "#f62d22";

/**
 * How long an annotation takes to arrive and to leave, in seconds. Enough that
 * it doesn't snap into existence, short enough that a two-second label is
 * still readable for most of its life — hence the cap at a third of the run.
 */
const FADE = 0.18;

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

/**
 * A new annotation of `kind`, placed around `time` and sized for a first look.
 *
 * Around, not from: a mark that began exactly at the playhead would be at the
 * very start of its own fade the moment it appeared — which is to say
 * invisible, on the one frame you're looking at. Adding a mark "here" means
 * about here, so `time` lands in the middle of it.
 */
export function newAnnotation(
  kind: AnnotationKind,
  time: number,
  duration: number,
  color = DEFAULT_ANNOTATION_COLOR,
): Annotation {
  const length = Math.min(ANNOTATION_DEFAULT_LENGTH, Math.max(duration, ANNOTATION_MIN_LENGTH));
  const start = clamp(time - length / 2, 0, Math.max(0, duration - length));
  const end = Math.min(duration, start + length);
  // Placed off-centre and to a readable size, so the first one you add is
  // already something you can see rather than a dot to hunt for.
  const shape = {
    text: { x: 0.12, y: 0.16, x2: 0.12, y2: 0.16 },
    arrow: { x: 0.25, y: 0.7, x2: 0.5, y2: 0.5 },
    box: { x: 0.32, y: 0.32, x2: 0.68, y2: 0.68 },
  }[kind];

  return {
    id: `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    kind,
    start,
    end: Math.max(start + ANNOTATION_MIN_LENGTH, end),
    ...shape,
    text: kind === "text" ? "Say something" : "",
    size: DEFAULT_ANNOTATION_SIZE,
    color,
  };
}

/** Hold every field to what the renderer and the panel can actually take. */
export function clampAnnotation(a: Annotation, duration: number): Annotation {
  const start = clamp(a.start, 0, Math.max(0, duration - ANNOTATION_MIN_LENGTH));
  return {
    ...a,
    start,
    end: clamp(a.end, start + ANNOTATION_MIN_LENGTH, Math.max(duration, start + ANNOTATION_MIN_LENGTH)),
    // Points may sit a little outside the capture — an arrow flying in from
    // off-screen is a reasonable thing to want — but not so far that a handle
    // becomes unreachable.
    x: clamp(a.x, -0.25, 1.25),
    y: clamp(a.y, -0.25, 1.25),
    x2: clamp(a.x2, -0.25, 1.25),
    y2: clamp(a.y2, -0.25, 1.25),
    size: clamp(a.size, ANNOTATION_MIN_SIZE, ANNOTATION_MAX_SIZE),
  };
}

export interface ShownAnnotation {
  annotation: Annotation;
  /** 0–1, ramped at both ends. */
  opacity: number;
}

/**
 * The annotations on screen at `time`, with how far in or out each one is.
 *
 * Returned in the order they were added, which is the order they're drawn:
 * the newest sits on top, which is what you expect of the one you just made.
 */
export function annotationsAt(
  annotations: Annotation[],
  time: number,
): ShownAnnotation[] {
  const out: ShownAnnotation[] = [];
  for (const annotation of annotations) {
    if (time < annotation.start || time > annotation.end) continue;
    const length = annotation.end - annotation.start;
    const fade = Math.min(FADE, length / 3);
    let opacity = 1;
    if (fade > 0) {
      const since = time - annotation.start;
      const until = annotation.end - time;
      opacity = clamp(Math.min(since, until) / fade, 0, 1);
    }
    out.push({ annotation, opacity });
  }
  return out;
}

/** Whether anything will be drawn over the recording at all. */
export function hasAnnotations(annotations: Annotation[] | null | undefined) {
  return !!annotations?.length;
}

/**
 * The points that can be dragged, in capture fractions.
 *
 * Text has one — it hangs off its anchor, and measuring where its box ends
 * needs a canvas, which the editor shouldn't have to reach for just to put a
 * handle somewhere. An arrow and a box each have two.
 */
export function handlesOf(a: Annotation): { x: number; y: number }[] {
  if (a.kind === "text") return [{ x: a.x, y: a.y }];
  return [
    { x: a.x, y: a.y },
    { x: a.x2, y: a.y2 },
  ];
}

/** Move the whole annotation by a delta in capture fractions. */
export function moveAnnotation(
  a: Annotation,
  dx: number,
  dy: number,
): Annotation {
  return { ...a, x: a.x + dx, y: a.y + dy, x2: a.x2 + dx, y2: a.y2 + dy };
}

/** Move one of its points, leaving the other where it is. */
export function moveHandle(
  a: Annotation,
  index: number,
  x: number,
  y: number,
): Annotation {
  if (index === 0) {
    // Text is its anchor: both points travel so the two never drift apart.
    if (a.kind === "text") return { ...a, x, y, x2: x, y2: y };
    return { ...a, x, y };
  }
  return { ...a, x2: x, y2: y };
}

/** The rectangle a box annotation covers, whichever corners were dragged. */
export function rectOf(a: Annotation): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  const x = Math.min(a.x, a.x2);
  const y = Math.min(a.y, a.y2);
  return { x, y, w: Math.abs(a.x2 - a.x), h: Math.abs(a.y2 - a.y) };
}
