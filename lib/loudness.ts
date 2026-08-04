"use client";

// Loudness, measured the way broadcasters measure it (ITU-R BS.1770-4, the
// basis of EBU R128).
//
// Peak level says almost nothing about how loud something sounds — one stray
// mouse click can pin the meter while the voice underneath stays inaudible.
// BS.1770 instead filters the signal the way an ear weights it, averages the
// energy over short blocks, and throws away the quiet ones so that pauses
// don't drag the answer down. What comes out is a single number in LUFS that
// matches perceived loudness closely enough that every streaming platform
// normalises to it.
//
// Everything here is arithmetic on samples: no network, no analysis service.

/** Weighting per channel. Front channels count fully; surrounds get a lift. */
const CHANNEL_WEIGHTS = [1, 1, 1, 1.41, 1.41];

/** Block length the standard averages over, and how far each block advances. */
const BLOCK_SECONDS = 0.4;
const STEP_SECONDS = 0.1;

/** Blocks below this are silence and never count. */
const ABSOLUTE_GATE = -70;
/** Blocks more than this far below the rough average don't count either. */
const RELATIVE_GATE = -10;

/** The constant that puts the filtered mean square on the LUFS scale. */
const OFFSET = -0.691;

export interface LoudnessReport {
  /** Integrated loudness in LUFS, or -Infinity when there's nothing there. */
  integrated: number;
  /** Highest value the waveform actually reaches between samples, dBTP. */
  truePeak: number;
  /** Highest sample, dBFS. */
  samplePeak: number;
  /** Seconds that survived gating — how much of the clip was really speech. */
  gatedSeconds: number;
}

/* ---------------------------------------------------------------- */
/* K-weighting                                                       */
/* ---------------------------------------------------------------- */

export interface Biquad {
  feedforward: number[];
  feedback: number[];
}

/**
 * The two filters BS.1770 puts in front of the meter: a shelf that lifts the
 * treble, standing in for the way a head boosts sound arriving at the ear, and
 * a high-pass that discards rumble the ear barely registers.
 *
 * The standard tabulates these at 48 kHz. Deriving them from the analog
 * prototype instead keeps them correct at any sample rate, and reproduces the
 * published numbers exactly at 48 kHz.
 */
export function kWeighting(rate: number): [Biquad, Biquad] {
  // Stage 1: high-frequency shelf, +4 dB.
  const f0 = 1681.974450955533;
  const gain = 3.999843853973347;
  const q = 0.7071752369554196;
  const k = Math.tan((Math.PI * f0) / rate);
  const vh = Math.pow(10, gain / 20);
  const vb = Math.pow(vh, 0.4996667741545416);
  const a0 = 1 + k / q + k * k;
  const shelf: Biquad = {
    feedforward: [
      (vh + (vb * k) / q + k * k) / a0,
      (2 * (k * k - vh)) / a0,
      (vh - (vb * k) / q + k * k) / a0,
    ],
    feedback: [1, (2 * (k * k - 1)) / a0, (1 - k / q + k * k) / a0],
  };

  // Stage 2: high-pass ("RLB") at ~38 Hz.
  const hf0 = 38.13547087602444;
  const hq = 0.5003270373238773;
  const hk = Math.tan((Math.PI * hf0) / rate);
  const hd = 1 + hk / hq + hk * hk;
  const highpass: Biquad = {
    feedforward: [1, -2, 1],
    feedback: [1, (2 * (hk * hk - 1)) / hd, (1 - hk / hq + hk * hk) / hd],
  };

  return [shelf, highpass];
}

/* ---------------------------------------------------------------- */
/* True peak                                                         */
/* ---------------------------------------------------------------- */

/** Sub-samples between each pair of real samples. */
const OVERSAMPLE = 4;
const TAPS = 12;
const CENTRE = TAPS / 2 - 1;

const sinc = (x: number) =>
  Math.abs(x) < 1e-9 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);

/** One windowed-sinc kernel per sub-sample position. */
export function interpolationPhases(): Float32Array[] {
  const phases: Float32Array[] = [];
  for (let p = 0; p < OVERSAMPLE; p++) {
    const taps = new Float32Array(TAPS);
    let sum = 0;
    for (let k = 0; k < TAPS; k++) {
      // Blackman window, so the kernel dies away smoothly at both ends.
      const w =
        0.42 -
        0.5 * Math.cos((2 * Math.PI * k) / (TAPS - 1)) +
        0.08 * Math.cos((4 * Math.PI * k) / (TAPS - 1));
      const value = sinc(k - CENTRE - p / OVERSAMPLE) * w;
      taps[k] = value;
      sum += value;
    }
    // Unity gain, so a constant signal comes back unchanged.
    for (let k = 0; k < TAPS; k++) taps[k] /= sum;
    phases.push(taps);
  }
  return phases;
}

/**
 * The loudest point the waveform passes through, including between samples.
 *
 * A signal can sit under 0 dBFS at every sample and still overshoot in
 * between; a converter reconstructing it will clip even though the file looks
 * clean. Reconstructing at four times the rate catches that — but only near
 * the peaks, since running the filter over every sample of a long recording
 * would cost far more than the answer is worth.
 */
function truePeakOf(channels: Float32Array[], samplePeak: number): number {
  if (samplePeak <= 0) return 0;
  const phases = interpolationPhases();
  // Anything well below the highest sample can't become the highest point.
  const threshold = samplePeak * 0.7;
  let peak = samplePeak;

  for (const data of channels) {
    for (let n = 0; n < data.length; n++) {
      if (Math.abs(data[n]) < threshold) continue;
      for (let p = 1; p < OVERSAMPLE; p++) {
        const taps = phases[p];
        let sum = 0;
        for (let k = 0; k < TAPS; k++) {
          const index = n + k - CENTRE;
          if (index >= 0 && index < data.length) sum += taps[k] * data[index];
        }
        const magnitude = Math.abs(sum);
        if (magnitude > peak) peak = magnitude;
      }
    }
  }
  return peak;
}

/* ---------------------------------------------------------------- */
/* Measurement                                                       */
/* ---------------------------------------------------------------- */

const toDb = (linear: number) =>
  linear > 0 ? 20 * Math.log10(linear) : -Infinity;

/** Run the buffer through the K-weighting filters, natively. */
async function kWeight(buffer: AudioBuffer): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(
    buffer.numberOfChannels,
    buffer.length,
    buffer.sampleRate,
  );
  const [shelf, highpass] = kWeighting(buffer.sampleRate);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source
    .connect(new IIRFilterNode(ctx, shelf))
    .connect(new IIRFilterNode(ctx, highpass))
    .connect(ctx.destination);
  source.start();
  return ctx.startRendering();
}

/** How loud one 400 ms window was — what the standard calls "momentary". */
export interface MomentaryLevel {
  /** Centre of the window, seconds. */
  t: number;
  lufs: number;
}

export interface LoudnessScan {
  report: LoudnessReport;
  /** Level over time, for finding the pauses. */
  profile: MomentaryLevel[];
}

/** Integrated loudness and peak levels for a whole buffer. */
export async function measureLoudness(
  buffer: AudioBuffer,
): Promise<LoudnessReport> {
  return (await scanLoudness(buffer)).report;
}

/**
 * The same measurement, keeping the level of every window on the way through.
 * One pass of the filters serves both: the single number that says how loud
 * the clip is, and the shape that says when it wasn't saying anything.
 */
export async function scanLoudness(buffer: AudioBuffer): Promise<LoudnessScan> {
  const rate = buffer.sampleRate;
  const channels: Float32Array[] = [];
  let samplePeak = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    channels.push(data);
    for (let i = 0; i < data.length; i++) {
      const magnitude = Math.abs(data[i]);
      if (magnitude > samplePeak) samplePeak = magnitude;
    }
  }

  const silent: LoudnessScan = {
    report: {
      integrated: -Infinity,
      truePeak: -Infinity,
      samplePeak: -Infinity,
      gatedSeconds: 0,
    },
    profile: [],
  };
  if (!channels.length || !buffer.length) return silent;

  const weighted = await kWeight(buffer);
  const filtered: Float32Array[] = [];
  for (let c = 0; c < weighted.numberOfChannels; c++) {
    filtered.push(weighted.getChannelData(c));
  }

  const blockLength = Math.round(BLOCK_SECONDS * rate);
  const step = Math.round(STEP_SECONDS * rate);
  if (buffer.length < blockLength) return silent;

  // Mean square per channel, for every overlapping block.
  const blocks: Float32Array[] = [];
  const levels: number[] = [];
  const profile: MomentaryLevel[] = [];
  const half = BLOCK_SECONDS / 2;
  for (let start = 0; start + blockLength <= buffer.length; start += step) {
    const means = new Float32Array(filtered.length);
    let weightedSum = 0;
    for (let c = 0; c < filtered.length; c++) {
      const data = filtered[c];
      let sum = 0;
      for (let i = start; i < start + blockLength; i++) sum += data[i] * data[i];
      const mean = sum / blockLength;
      means[c] = mean;
      weightedSum += (CHANNEL_WEIGHTS[c] ?? 1) * mean;
    }
    const level = weightedSum > 0 ? OFFSET + 10 * Math.log10(weightedSum) : -Infinity;
    blocks.push(means);
    levels.push(level);
    // Stamped at the middle of the window, which is the moment it describes.
    profile.push({ t: start / rate + half, lufs: level });
  }
  if (!blocks.length) return silent;

  /** Loudness of the average energy across a set of blocks. */
  const loudnessOf = (keep: number[]): number => {
    if (!keep.length) return -Infinity;
    let total = 0;
    for (let c = 0; c < filtered.length; c++) {
      let sum = 0;
      for (const index of keep) sum += blocks[index][c];
      total += (CHANNEL_WEIGHTS[c] ?? 1) * (sum / keep.length);
    }
    return total > 0 ? OFFSET + 10 * Math.log10(total) : -Infinity;
  };

  // First gate: drop anything that's simply silence.
  const loud: number[] = [];
  for (let i = 0; i < levels.length; i++) {
    if (levels[i] >= ABSOLUTE_GATE) loud.push(i);
  }
  if (!loud.length) return { ...silent, profile };

  // Second gate: drop anything far below the clip's own average, so that
  // pauses between sentences don't pull the measurement down.
  const relative = loudnessOf(loud) + RELATIVE_GATE;
  const kept = loud.filter((i) => levels[i] >= relative);
  if (!kept.length) return { ...silent, profile };

  return {
    report: {
      integrated: loudnessOf(kept),
      truePeak: toDb(truePeakOf(channels, samplePeak)),
      samplePeak: toDb(samplePeak),
      gatedSeconds: kept.length * STEP_SECONDS,
    },
    profile,
  };
}

/* ---------------------------------------------------------------- */
/* Normalisation                                                     */
/* ---------------------------------------------------------------- */

/** What most platforms play speech back at. */
export const TARGET_LUFS = -16;
/** Leave this much headroom, so nothing clips on the way out. */
export const PEAK_CEILING_DBTP = -1;

export interface Normalisation {
  /** Linear gain to apply. */
  gain: number;
  /** Where the clip will land, LUFS. */
  reached: number;
  /** True when the peak ceiling stopped it reaching the target. */
  peakLimited: boolean;
}

/**
 * The single gain that brings a clip to the target loudness — backed off if
 * that would push the waveform past the ceiling. Reaching the target matters
 * less than not clipping to get there, so the ceiling always wins.
 */
export function normalisation(
  report: LoudnessReport,
  target = TARGET_LUFS,
  ceiling = PEAK_CEILING_DBTP,
): Normalisation {
  if (!isFinite(report.integrated)) {
    return { gain: 1, reached: report.integrated, peakLimited: false };
  }
  const wanted = target - report.integrated;
  const headroom = isFinite(report.truePeak) ? ceiling - report.truePeak : wanted;
  const db = Math.min(wanted, headroom);
  return {
    gain: Math.pow(10, db / 20),
    reached: report.integrated + db,
    peakLimited: headroom < wanted,
  };
}
