"use client";

// What we do to a recording's sound, and the settings that decide it.
//
// A screen recording's audio is whatever the microphone happened to give:
// one clip is barely audible, the next is twice as loud, and both carry the
// low rumble a desk transmits into a mic. Neither is a taste question, so
// neither should be left to the eye and a volume slider — the level is
// measured (see lib/loudness.ts) and corrected by exactly the difference.

import { measureLoudness, normalisation, type LoudnessReport } from "@/lib/loudness";

export interface SoundStyle {
  /** Bring the clip to a standard loudness. */
  normalise: boolean;
  /** Cut the low rumble a desk and a room put into a microphone. */
  rumble: boolean;
}

export const DEFAULT_SOUND_STYLE: SoundStyle = { normalise: true, rumble: false };

/** Below here is desk thump and room rumble, not voice. */
export const RUMBLE_HZ = 80;

/** The sample rate everything is measured and mixed at. */
export const MIX_RATE = 48_000;

/**
 * Decode a recording's audio, or null when it has none. Video containers
 * decode fine here — the browser picks the audio track out of them.
 */
export async function decodeRecordingAudio(
  blob: Blob,
): Promise<AudioBuffer | null> {
  try {
    // An offline context decodes without opening an output device, and pins
    // the rate so a measurement is the same on every machine.
    const ctx = new OfflineAudioContext(1, 1, MIX_RATE);
    return await ctx.decodeAudioData(await blob.arrayBuffer());
  } catch {
    return null;
  }
}

export interface SoundAnalysis {
  report: LoudnessReport;
  /** Linear gain that puts this recording on target. */
  gain: number;
  /** Where it lands after that gain, LUFS. */
  reached: number;
  /** True when the peak ceiling stopped it reaching the target. */
  peakLimited: boolean;
}

/** Measure a recording once, and work out what it needs. */
export async function analyseSound(blob: Blob): Promise<SoundAnalysis | null> {
  const buffer = await decodeRecordingAudio(blob);
  if (!buffer) return null;
  const report = await measureLoudness(buffer);
  if (!isFinite(report.integrated)) return null;
  const { gain, reached, peakLimited } = normalisation(report);
  return { report, gain, reached, peakLimited };
}

/** What the export paths need to apply: one gain, and whether to filter. */
export interface SoundTreatment {
  gain: number;
  rumble: boolean;
}

/** Turn the measurement and the user's choices into that. */
export function treatmentFor(
  style: SoundStyle,
  analysis: SoundAnalysis | null,
): SoundTreatment {
  return {
    gain: style.normalise && analysis ? analysis.gain : 1,
    rumble: style.rumble,
  };
}

/** True when the treatment would leave the sound exactly as recorded. */
export function isNeutral(treatment: SoundTreatment): boolean {
  return !treatment.rumble && Math.abs(treatment.gain - 1) < 1e-4;
}
