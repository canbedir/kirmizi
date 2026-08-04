"use client";

// The frame-exact exporter.
//
// The other path (export-segments.ts) plays the recording back and captures
// the result, so a ten-minute clip takes ten minutes and a busy machine drops
// frames — the output isn't even the same twice. This one never plays
// anything: it decodes the samples in order, draws each one through the scene
// renderer, and encodes the result. Every frame is accounted for, and it runs
// several times faster than the clip is long.
//
// Audio is mixed offline in one pass, which is effectively instant, and comes
// out as AAC — so mp4 exports no longer need the ffmpeg remux afterwards.
//
// Needs WebCodecs and an mp4 source. Anything else falls back to the old path.

import type { Segment } from "@/lib/use-video-editor";
import {
  drawSceneFrame,
  type FrameSize,
  type Scene,
  type SceneImage,
} from "@/lib/render-scene";
import { outputSize } from "@/lib/scene";
import { createClickVoice } from "@/lib/click-sound";
import { demuxVideo, looksDemuxable, type DemuxedVideo } from "@/lib/mp4-demux";
import { createFrameReader } from "@/lib/frame-reader";
import { RUMBLE_HZ, decodeRecordingAudio, type SoundTreatment } from "@/lib/sound";

/**
 * Frames are emitted one per source frame, at the source's own timing, rather
 * than resampled onto a fixed grid. A screen recording is never exactly 30fps
 * — the browser hands over frames when the picture changes — so resampling
 * duplicates some frames and quietly drops others. Keeping the original
 * cadence is both truer to the capture and less work.
 */
const AUDIO_RATE = 48_000;
const AUDIO_BITRATE = 192_000;
/** Samples per AudioData handed to the encoder. */
const AUDIO_BLOCK = 1024;
/** Seconds between forced keyframes, so the result stays seekable. */
const KEYFRAME_EVERY = 2;
/** Encoded frames in flight before we let the encoder catch up. */
const MAX_ENCODE_QUEUE = 10;

export interface FastExportInput {
  /** The screen recording. */
  blob: Blob;
  mimeType: string;
  segments: Segment[];
  scene?: Scene | null;
  /** The webcam recording, when the scene composites one. */
  cameraBlob?: Blob | null;
  /** Level correction and filtering, measured beforehand. */
  sound?: SoundTreatment | null;
  onProgress?: (fraction: number) => void;
}

/** Whether this recording is worth trying the frame-exact path on. */
export function canFastExport(blob: Blob, mimeType: string): boolean {
  return (
    typeof VideoEncoder !== "undefined" &&
    typeof AudioEncoder !== "undefined" &&
    typeof VideoFrame !== "undefined" &&
    looksDemuxable(blob, mimeType)
  );
}

/* ---------------------------------------------------------------- */
/* Timeline                                                          */
/* ---------------------------------------------------------------- */

interface Placed extends Segment {
  /** Where this segment begins in the exported clip. */
  outStart: number;
  outEnd: number;
}

function place(segments: Segment[]): { placed: Placed[]; total: number } {
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
function outputTimeAt(placed: Placed[], source: number): number | null {
  for (const segment of placed) {
    if (source >= segment.start && source < segment.end) {
      return segment.outStart + (source - segment.start) / segment.speed;
    }
  }
  return null;
}

/** One frame of the export: which source moment to draw, and where it goes. */
interface Shot {
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
function plan(placed: Placed[], stamps: number[], sourceEnd: number): Shot[] {
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

/* ---------------------------------------------------------------- */
/* Encoders                                                          */
/* ---------------------------------------------------------------- */

type MuxVideoCodec = "avc" | "hevc" | "vp9" | "av1";

async function pickVideoEncoder(
  width: number,
  height: number,
  framerate: number,
): Promise<{ config: VideoEncoderConfig; muxCodec: MuxVideoCodec }> {
  // Same generosity the recorder uses, so an export doesn't look softer than
  // what it came from.
  const bitrate = Math.min(
    100_000_000,
    Math.max(8_000_000, Math.round(width * height * framerate * 0.2)),
  );
  const candidates: { codec: string; muxCodec: MuxVideoCodec }[] = [
    { codec: "avc1.640034", muxCodec: "avc" }, // High 5.2 — covers 4K
    { codec: "avc1.640028", muxCodec: "avc" },
    { codec: "avc1.42E028", muxCodec: "avc" }, // Baseline, last resort
    { codec: "vp09.00.41.08", muxCodec: "vp9" },
  ];
  for (const { codec, muxCodec } of candidates) {
    const config: VideoEncoderConfig = {
      codec,
      width,
      height,
      bitrate,
      framerate,
      latencyMode: "quality",
      ...(codec.startsWith("avc") ? { avc: { format: "avc" as const } } : {}),
    };
    const support = await VideoEncoder.isConfigSupported(config).catch(
      () => null,
    );
    if (support?.supported) return { config, muxCodec };
  }
  throw new Error("This browser can't encode video frames.");
}

/* ---------------------------------------------------------------- */
/* Audio                                                             */
/* ---------------------------------------------------------------- */

/**
 * Build the finished soundtrack in one offline pass: each kept segment played
 * at its own rate through its own gain, with the synthesised clicks mixed on
 * top. Rendering this is roughly a thousand times faster than listening to it.
 */
async function renderAudio(
  blob: Blob,
  placed: Placed[],
  total: number,
  scene: Scene | null | undefined,
  hasSourceAudio: boolean,
  sound: SoundTreatment | null | undefined,
): Promise<AudioBuffer | null> {
  const cursor = scene?.cursor;
  const clicks =
    cursor?.style.sound && cursor.track.clicks.length ? cursor.track.clicks : [];
  if (!hasSourceAudio && !clicks.length) return null;
  if (total <= 0) return null;

  let decoded: AudioBuffer | null = null;
  if (hasSourceAudio) {
    decoded = await decodeRecordingAudio(blob);
    if (!decoded) throw new Error("Couldn't read the recording's audio.");
  }

  const channels = Math.min(2, Math.max(1, decoded?.numberOfChannels ?? 2));
  const ctx = new OfflineAudioContext(
    channels,
    Math.max(1, Math.ceil(total * AUDIO_RATE)),
    AUDIO_RATE,
  );

  if (decoded) {
    // Level and filtering apply to what was recorded, not to the clicks we
    // add — those are already at a chosen level.
    let bus: AudioNode = ctx.destination;
    if (sound?.rumble) {
      const filter = ctx.createBiquadFilter();
      filter.type = "highpass";
      filter.frequency.value = RUMBLE_HZ;
      filter.connect(bus);
      bus = filter;
    }
    if (sound && Math.abs(sound.gain - 1) > 1e-4) {
      const level = ctx.createGain();
      level.gain.value = sound.gain;
      level.connect(bus);
      bus = level;
    }

    for (const segment of placed) {
      const length = segment.end - segment.start;
      if (length <= 0) continue;
      const source = ctx.createBufferSource();
      source.buffer = decoded;
      source.playbackRate.value = segment.speed;
      const gain = ctx.createGain();
      gain.gain.value = segment.muted ? 0 : 1;
      source.connect(gain).connect(bus);
      // Stop by output time rather than passing a duration: that way the cut
      // lands in the same place whatever the speed.
      source.start(segment.outStart, segment.start);
      source.stop(segment.outEnd);
    }
  }

  if (clicks.length) {
    // Straight to the destination, so a muted segment still gets its clicks —
    // they're ours, not part of what was recorded.
    const voice = createClickVoice(ctx, ctx.destination);
    for (const click of clicks) {
      const at = outputTimeAt(placed, click.t / 1000);
      if (at !== null) voice.play(at, click.button === 2);
    }
  }

  return ctx.startRendering();
}

/** Feed a rendered buffer through the AAC encoder. */
async function encodeAudio(
  buffer: AudioBuffer,
  encoder: AudioEncoder,
): Promise<void> {
  const channels = buffer.numberOfChannels;
  const rate = buffer.sampleRate;
  const planes: Float32Array[] = [];
  for (let c = 0; c < channels; c++) planes.push(buffer.getChannelData(c));

  for (let offset = 0; offset < buffer.length; offset += AUDIO_BLOCK) {
    const frames = Math.min(AUDIO_BLOCK, buffer.length - offset);
    const planar = new Float32Array(frames * channels);
    for (let c = 0; c < channels; c++) {
      planar.set(planes[c].subarray(offset, offset + frames), c * frames);
    }
    const data = new AudioData({
      format: "f32-planar",
      sampleRate: rate,
      numberOfFrames: frames,
      numberOfChannels: channels,
      timestamp: Math.round((offset / rate) * 1e6),
      data: planar,
    });
    encoder.encode(data);
    data.close();
  }
  await encoder.flush();
}

/* ---------------------------------------------------------------- */
/* Export                                                            */
/* ---------------------------------------------------------------- */

function makeCanvas(width: number, height: number) {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d", { alpha: false });
    if (ctx) return { canvas, ctx };
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Canvas 2D isn't available for the export.");
  return { canvas, ctx };
}

export async function fastExport(input: FastExportInput): Promise<Blob> {
  const { blob, segments, scene, cameraBlob, onProgress } = input;
  const { Muxer, ArrayBufferTarget } = await import("mp4-muxer");

  const source: DemuxedVideo = await demuxVideo(blob);
  const sourceW = source.width;
  const sourceH = source.height;
  if (!sourceW || !sourceH) throw new Error("The recording has no frame size.");
  // The exported frame may be a different shape from the capture.
  const { w: width, h: height } = scene
    ? outputSize(sourceW, sourceH, scene.style.aspect)
    : { w: sourceW, h: sourceH };
  const size: FrameSize = { w: width, h: height, sourceW, sourceH };

  const fps = Math.min(120, Math.max(5, Math.round(source.fps) || 30));
  const { placed, total } = place(segments);
  if (total <= 0) throw new Error("Nothing left to export.");

  // The exact moments the source has a picture for, in presentation order.
  const stamps = source.chunks.map((c) => c.timestamp / 1e6).sort((a, b) => a - b);
  const shots = plan(placed, stamps, source.duration);
  if (!shots.length) throw new Error("Nothing left to export.");

  // Audio first: it's cheap, and the muxer needs to know the track's shape
  // before anything is written.
  const audio = await renderAudio(
    blob,
    placed,
    total,
    scene,
    source.hasAudio,
    input.sound,
  );

  const { config: encoderConfig, muxCodec } = await pickVideoEncoder(
    width,
    height,
    fps,
  );

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    // No frameRate: that would round every timestamp onto a fixed grid, which
    // is exactly the resampling this path avoids.
    video: { codec: muxCodec, width, height },
    ...(audio
      ? {
          audio: {
            codec: "aac" as const,
            numberOfChannels: audio.numberOfChannels,
            sampleRate: audio.sampleRate,
          },
        }
      : {}),
    fastStart: "in-memory" as const,
  });

  let fatal: Error | null = null;
  const fail = (e: unknown) => {
    fatal ??= e instanceof Error ? e : new Error(String(e));
  };

  if (audio) {
    const audioEncoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: fail,
    });
    audioEncoder.configure({
      codec: "mp4a.40.2",
      sampleRate: audio.sampleRate,
      numberOfChannels: audio.numberOfChannels,
      bitrate: AUDIO_BITRATE,
    });
    await encodeAudio(audio, audioEncoder);
    audioEncoder.close();
    if (fatal) throw fatal;
  }

  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: fail,
  });
  videoEncoder.configure(encoderConfig);

  const reader = createFrameReader(source);
  let cameraReader: ReturnType<typeof createFrameReader> | null = null;
  let cameraSize = { width: 0, height: 0 };
  if (scene?.camera && cameraBlob) {
    // If the webcam track can't be read, fall back rather than quietly
    // dropping it from the export.
    const cam = await demuxVideo(cameraBlob);
    cameraReader = createFrameReader(cam);
    cameraSize = { width: cam.width, height: cam.height };
  }

  const { canvas, ctx } = makeCanvas(width, height);
  let nextKeyframe = 0;

  try {
    for (let i = 0; i < shots.length; i++) {
      if (fatal) throw fatal;
      const shot = shots[i];
      const frame = await reader.frameAt(shot.source);

      if (!frame) {
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, width, height);
      } else if (scene) {
        let cam: SceneImage | null = null;
        if (cameraReader) {
          const camFrame = await cameraReader.frameAt(shot.source);
          if (camFrame) {
            cam = {
              image: camFrame,
              width: cameraSize.width,
              height: cameraSize.height,
            };
          }
        }
        drawSceneFrame(ctx, frame, scene, size, shot.source, cam);
      } else {
        ctx.drawImage(frame, 0, 0, width, height);
      }

      const out = new VideoFrame(canvas, {
        timestamp: Math.round(shot.out * 1e6),
        duration: Math.round(shot.hold * 1e6),
      });
      const keyFrame = shot.out >= nextKeyframe;
      if (keyFrame) nextKeyframe = shot.out + KEYFRAME_EVERY;
      videoEncoder.encode(out, { keyFrame });
      out.close();

      // Let the encoder drain, and let the page breathe while it does.
      while (videoEncoder.encodeQueueSize > MAX_ENCODE_QUEUE && !fatal) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      onProgress?.((i + 1) / shots.length);
    }

    await videoEncoder.flush();
    if (fatal) throw fatal;
    muxer.finalize();
    return new Blob([target.buffer], { type: "video/mp4" });
  } finally {
    reader.close();
    cameraReader?.close();
    if (videoEncoder.state !== "closed") videoEncoder.close();
  }
}
