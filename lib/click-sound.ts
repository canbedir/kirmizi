"use client";

// A click, synthesised rather than sampled — no asset to ship, and it can be
// retuned by changing numbers. Two layers, both very short: a noise transient
// for the "tick" of the switch and a low sine body for the "thock" of the
// button bottoming out.

const NOISE_MS = 18;

/** Plays clicks into a given audio destination. */
export interface ClickVoice {
  /** Fire a click at `when` (an AudioContext timestamp). */
  play: (when: number, secondary?: boolean) => void;
  dispose: () => void;
}

function makeNoiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const length = Math.max(1, Math.floor((ctx.sampleRate * NOISE_MS) / 1000));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    // Decay the noise as it's written so the transient is front-loaded.
    const decay = Math.pow(1 - i / length, 3);
    data[i] = (Math.random() * 2 - 1) * decay;
  }
  return buffer;
}

/**
 * Build a click voice on `ctx`, mixed into `destination` at `volume` (0..1).
 * The noise buffer is generated once and reused for every click.
 */
export function createClickVoice(
  ctx: BaseAudioContext,
  destination: AudioNode,
  volume = 0.35,
): ClickVoice {
  const noise = makeNoiseBuffer(ctx);
  const out = ctx.createGain();
  out.gain.value = volume;
  out.connect(destination);

  const play = (when: number, secondary = false) => {
    const t = Math.max(when, ctx.currentTime);

    // Transient: filtered noise, gone in ~20ms.
    const source = ctx.createBufferSource();
    source.buffer = noise;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = secondary ? 1900 : 2600;
    band.Q.value = 0.9;
    const tick = ctx.createGain();
    tick.gain.setValueAtTime(1, t);
    tick.gain.exponentialRampToValueAtTime(0.0001, t + NOISE_MS / 1000);
    source.connect(band).connect(tick).connect(out);
    source.start(t);
    source.stop(t + NOISE_MS / 1000);

    // Body: a brief sine that gives the click some weight.
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(secondary ? 320 : 420, t);
    osc.frequency.exponentialRampToValueAtTime(secondary ? 150 : 190, t + 0.03);
    const body = ctx.createGain();
    body.gain.setValueAtTime(0.0001, t);
    body.gain.exponentialRampToValueAtTime(0.5, t + 0.002);
    body.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
    osc.connect(body).connect(out);
    osc.start(t);
    osc.stop(t + 0.05);
  };

  return {
    play,
    dispose: () => {
      try {
        out.disconnect();
      } catch {
        /* already torn down */
      }
    },
  };
}
