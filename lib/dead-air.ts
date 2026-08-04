"use client";

// Finding the parts of a recording where nothing happens.
//
// Every editor cuts on silence. That works for a talking head and ruins a
// screen recording: plenty of good demos have no narration at all, and cutting
// on silence alone would take the whole thing. The opposite rule — cut where
// the pointer is idle — ruins the other half, because the moment someone stops
// moving the mouse to explain something is usually the moment that matters.
//
// So neither signal decides on its own. A stretch is dead only when it is
// quiet *and* the pointer is still: nothing being said, nothing being shown.
// Where a recording has only one of the two, that one carries it, which is the
// right behaviour rather than a special case — a silent screencast is judged
// on the pointer, and a recording made without the companion on the sound.

import type { CursorTrack } from "@/lib/cursor-track";
import type { MomentaryLevel } from "@/lib/loudness";
import type { Segment } from "@/lib/use-video-editor";

/** Resolution of the whole analysis, seconds. */
const STEP = 0.1;

/**
 * How far below the clip's own loudness counts as a pause. Measuring against
 * the recording rather than a fixed level means a quietly-recorded voice isn't
 * mistaken for silence throughout.
 */
const QUIET_BELOW = 22;
/** …but never treat anything above this as a pause, however loud the rest. */
const QUIET_CEILING = -45;

/** How far the pointer may wander and still count as parked. */
const STILL_BOX = 0.012;
/** The window either side of a moment that stillness is judged over. */
const STILL_WINDOW = 0.4;
/** A click keeps this much time around it alive, whatever else is true. */
const CLICK_GUARD = 0.5;

/** Shorter than this is a breath, not dead air. */
const MIN_DEAD = 1.4;
/**
 * Left at each end of a cut, on top of the margin the windows above already
 * give it — stillness is judged over a window centred on each moment, so a
 * run is already inset by half of one before this is applied. Between them
 * roughly half a second survives at each end, which is the beat an editor
 * would leave anyway: cutting speech to speech with nothing between sounds
 * rushed, not tight.
 */
const PAD = 0.15;
/** Below this there's nothing worth the cut. */
const MIN_CUT = 0.5;

export interface DeadRange {
  start: number;
  end: number;
}

export interface DeadAirReport {
  /** Source ranges worth removing. */
  ranges: DeadRange[];
  /** Seconds they add up to. */
  removed: number;
  /** Which signals the answer actually rests on. */
  used: { sound: boolean; pointer: boolean };
}

export const NO_DEAD_AIR: DeadAirReport = {
  ranges: [],
  removed: 0,
  used: { sound: false, pointer: false },
};

/** Momentary level at each step, sampled from the loudness profile. */
function quietness(
  profile: MomentaryLevel[],
  steps: number,
  threshold: number,
): boolean[] {
  const quiet = new Array<boolean>(steps).fill(true);
  let i = 0;
  for (let s = 0; s < steps; s++) {
    const t = s * STEP + STEP / 2;
    while (i + 1 < profile.length && profile[i + 1].t <= t) i++;
    // Windows overlap, so the nearer of the two straddling this moment is the
    // one that describes it.
    const here = profile[i];
    const next = profile[i + 1];
    const level =
      next && Math.abs(next.t - t) < Math.abs(here.t - t) ? next.lufs : here.lufs;
    quiet[s] = !(level > threshold);
  }
  return quiet;
}

/**
 * Whether the pointer was parked at each step.
 *
 * The companion only reports the pointer when it moves, so a gap in the
 * samples is not missing data — it is the strongest evidence there is that
 * nothing moved. Both cases fall out of the same test: take everything inside
 * the window and ask how far it spread.
 */
function stillness(track: CursorTrack, steps: number): boolean[] {
  const still = new Array<boolean>(steps).fill(true);
  const samples = track.samples;
  let from = 0;
  let to = 0;
  for (let s = 0; s < steps; s++) {
    const t = s * STEP + STEP / 2;
    const lo = (t - STILL_WINDOW) * 1000;
    const hi = (t + STILL_WINDOW) * 1000;
    while (from < samples.length && samples[from].t < lo) from++;
    if (to < from) to = from;
    while (to < samples.length && samples[to].t <= hi) to++;

    let minX = 1;
    let maxX = 0;
    let minY = 1;
    let maxY = 0;
    for (let i = from; i < to; i++) {
      const p = samples[i];
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    still[s] =
      to <= from || (maxX - minX <= STILL_BOX && maxY - minY <= STILL_BOX);
  }

  // A click is activity even when the hand doesn't move to make it.
  for (const click of track.clicks) {
    const at = click.t / 1000;
    const lo = Math.max(0, Math.floor((at - CLICK_GUARD) / STEP));
    const hi = Math.min(steps - 1, Math.ceil((at + CLICK_GUARD) / STEP));
    for (let s = lo; s <= hi; s++) still[s] = false;
  }
  return still;
}

/** Clip a range to what's still in the timeline, dropping what isn't. */
function withinSegments(range: DeadRange, segments: Segment[]): DeadRange[] {
  const out: DeadRange[] = [];
  for (const segment of segments) {
    const start = Math.max(range.start, segment.start);
    const end = Math.min(range.end, segment.end);
    if (end - start > 0) out.push({ start, end });
  }
  return out;
}

export interface DeadAirInput {
  duration: number;
  /** The kept timeline — nothing already cut is proposed again. */
  segments: Segment[];
  /** Momentary loudness over the recording, when it has sound. */
  profile?: MomentaryLevel[] | null;
  /** The clip's own loudness, which the pause threshold is set against. */
  integrated?: number;
  track?: CursorTrack | null;
}

/** The stretches worth cutting, and what they'd save. */
export function findDeadAir(input: DeadAirInput): DeadAirReport {
  const { duration, segments, profile, integrated, track } = input;
  if (duration <= 0) return NO_DEAD_AIR;

  const hasSound = !!profile?.length && integrated !== undefined && isFinite(integrated);
  const hasPointer = !!track && track.samples.length > 1;
  // With neither signal there is nothing to go on, and guessing would be
  // worse than leaving the clip alone.
  if (!hasSound && !hasPointer) return NO_DEAD_AIR;

  const steps = Math.ceil(duration / STEP);
  const quiet = hasSound
    ? quietness(profile!, steps, Math.min(QUIET_CEILING, integrated! - QUIET_BELOW))
    : null;
  const still = hasPointer ? stillness(track!, steps) : null;

  // Runs where both signals agree there's nothing going on.
  const runs: DeadRange[] = [];
  let open = -1;
  for (let s = 0; s <= steps; s++) {
    const dead =
      s < steps && (!quiet || quiet[s]) && (!still || still[s]);
    if (dead && open < 0) open = s;
    if (!dead && open >= 0) {
      runs.push({ start: open * STEP, end: s * STEP });
      open = -1;
    }
  }

  const ranges: DeadRange[] = [];
  for (const run of runs) {
    if (run.end - run.start < MIN_DEAD) continue;
    // Leave a beat at each end so the cut doesn't clip the words either side.
    // At the very start and end of the clip there's nothing to protect, so
    // the dead time can go all the way out.
    const start = run.start <= STEP ? 0 : run.start + PAD;
    const end = run.end >= duration - STEP ? duration : run.end - PAD;
    if (end - start < MIN_CUT) continue;
    for (const piece of withinSegments({ start, end }, segments)) {
      if (piece.end - piece.start >= MIN_CUT) ranges.push(piece);
    }
  }

  return {
    ranges,
    removed: ranges.reduce((sum, r) => sum + (r.end - r.start), 0),
    used: { sound: hasSound, pointer: hasPointer },
  };
}
