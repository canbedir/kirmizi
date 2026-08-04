"use client";

// The edited timeline, as arithmetic.
//
// Cuts and per-segment speed mean source time and exported time are two
// different clocks, and nearly everything downstream needs to convert between
// them: which frame to draw at a given moment, where a click sound lands, how
// long the result is. That mapping lives here, apart from the machinery that
// uses it, because it is the part that has to be exactly right.

import type { Segment } from "@/lib/use-video-editor";

/** A kept segment, with the span it occupies in the exported clip. */
export interface Placed extends Segment {
  /** Where this segment begins in the exported clip. */
  outStart: number;
  outEnd: number;
}

/** Lay the kept segments end to end, at their own speeds. */
export function place(segments: Segment[]): {
  placed: Placed[];
  total: number;
} {
  const placed: Placed[] = [];
  let elapsed = 0;
  for (const segment of segments) {
    const length = (segment.end - segment.start) / segment.speed;
    placed.push({ ...segment, outStart: elapsed, outEnd: elapsed + length });
    elapsed += length;
  }
  return { placed, total: elapsed };
}

/** Where a source moment lands in the exported clip, or null if it was cut. */
export function outputTimeAt(placed: Placed[], source: number): number | null {
  for (const segment of placed) {
    if (source >= segment.start && source < segment.end) {
      return segment.outStart + (source - segment.start) / segment.speed;
    }
  }
  return null;
}

/** One frame of the export: which source moment to draw, and where it goes. */
export interface Shot {
  source: number;
  out: number;
  /** Output seconds this frame is held for. */
  hold: number;
}

/**
 * Every frame the export will contain, in order.
 *
 * Each kept segment starts from the frame that was *showing* at its in-point —
 * the last one at or before it, not the next one along. Trim to 2.30s when the
 * nearest frame is at 2.28s and 2.28s is what a viewer sees there; taking the
 * next frame instead would leave the segment starting a little late, and the
 * very first one starting after zero, which no mp4 will accept.
 */
export function plan(
  placed: Placed[],
  stamps: number[],
  sourceEnd: number,
): Shot[] {
  const shots: Shot[] = [];
  for (const segment of placed) {
    let first = 0;
    for (let i = 0; i < stamps.length; i++) {
      if (stamps[i] <= segment.start) first = i;
      else break;
    }
    const taken: number[] = [];
    for (let i = first; i < stamps.length && stamps[i] < segment.end; i++) {
      taken.push(stamps[i]);
    }
    if (!taken.length) taken.push(Math.min(segment.start, sourceEnd));

    const start = shots.length;
    for (const source of taken) {
      shots.push({
        source,
        out:
          segment.outStart +
          Math.max(0, source - segment.start) / segment.speed,
        hold: 0,
      });
    }
    // Hold each frame until the next one is due, so the segment's own length
    // is exactly what the timeline says however the source frames fell.
    for (let i = start; i < shots.length; i++) {
      const until = i + 1 < shots.length ? shots[i + 1].out : segment.outEnd;
      shots[i].hold = Math.max(1e-3, until - shots[i].out);
    }
  }
  return shots;
}
