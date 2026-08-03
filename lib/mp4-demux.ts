"use client";

// Pull the encoded video samples out of an mp4 so WebCodecs can decode them
// directly, instead of playing the file back through a <video> element in real
// time. Everything here is container work — no pixels are touched.
//
// Only mp4 is handled, which is what Chrome and Edge produce (the recorder
// asks for mp4 first). Anything else falls back to the real-time exporter.

import type { Track as Mp4Track } from "mp4box";

/** The same ceiling ffmpeg.wasm gets: past this we'd be holding the whole
 *  recording and its re-encode in memory at once. */
const MAX_INPUT_BYTES = 800 * 1024 * 1024;

export interface DemuxedVideo {
  chunks: EncodedVideoChunk[];
  config: VideoDecoderConfig;
  width: number;
  height: number;
  /** Seconds. */
  duration: number;
  /** Frames per second, averaged over the file. */
  fps: number;
  /** Whether the file carries an audio track at all — a recording made with
   *  nothing to listen to is silent on purpose, not a decode failure. */
  hasAudio: boolean;
}

/**
 * mp4box hands back whatever codec string the file declares, and MediaRecorder
 * writes VP9 with a level of 0 — which VideoDecoder rejects as ambiguous. Fill
 * in a level that covers the resolution and let the probe below settle it.
 */
function codecCandidates(codec: string, width: number, height: number): string[] {
  if (!codec.startsWith("vp09")) return [codec];
  const parts = codec.split(".");
  const profile = parts[1] ?? "00";
  const depth = parts[3] ?? "08";
  const level = parts[2];
  const pixels = width * height;
  // Roughly: 1080p wants 4.0, 1440p 5.0, 4K 5.1.
  const guesses =
    pixels > 3_500_000
      ? ["51", "52", "50", "60"]
      : pixels > 2_100_000
        ? ["50", "51", "41", "40"]
        : ["40", "41", "31", "30", "50"];
  const out = level && level !== "00" ? [codec] : [];
  for (const g of guesses) out.push(`vp09.${profile}.${g}.${depth}`);
  return out;
}

/** The codec-private data (avcC / vpcC / …) a decoder needs to start. */
function descriptionOf(
  file: { getTrackById: (id: number) => unknown },
  trackId: number,
  DataStream: typeof import("mp4box").DataStream,
): Uint8Array | undefined {
  const trak = file.getTrackById(trackId) as {
    mdia?: { minf?: { stbl?: { stsd?: { entries?: Record<string, unknown>[] } } } };
  };
  const entries = trak?.mdia?.minf?.stbl?.stsd?.entries ?? [];
  for (const entry of entries) {
    const box = (entry.avcC ?? entry.hvcC ?? entry.vpcC ?? entry.av1C) as
      | { write: (s: unknown) => void }
      | undefined;
    if (!box) continue;
    // DataStream defaults to big-endian, which is what mp4 boxes are.
    const stream = new DataStream();
    box.write(stream);
    // Drop the 8-byte box header; the decoder wants the payload only.
    return new Uint8Array(stream.buffer, 8);
  }
  return undefined;
}

/** Whether this recording could go through the frame-exact exporter at all. */
export function looksDemuxable(blob: Blob, mimeType: string): boolean {
  if (typeof VideoDecoder === "undefined" || typeof VideoEncoder === "undefined") {
    return false;
  }
  if (blob.size > MAX_INPUT_BYTES) return false;
  const type = (mimeType || blob.type || "").toLowerCase();
  return type.includes("mp4");
}

/**
 * Read every encoded video sample out of `blob`, in decode order, along with a
 * decoder config the browser has already agreed to.
 */
export async function demuxVideo(blob: Blob): Promise<DemuxedVideo> {
  const { createFile, DataStream } = await import("mp4box");

  const file = createFile();
  const chunks: EncodedVideoChunk[] = [];
  let track: Mp4Track | undefined;
  let description: Uint8Array | undefined;
  let hasAudio = false;

  await new Promise<void>((resolve, reject) => {
    file.onError = (e: unknown) => reject(new Error(`Couldn't read the mp4: ${e}`));
    file.onReady = (info) => {
      hasAudio = (info.audioTracks?.length ?? 0) > 0;
      track = info.videoTracks?.[0];
      if (!track) {
        reject(new Error("The recording has no video track."));
        return;
      }
      description = descriptionOf(
        file as unknown as { getTrackById: (id: number) => unknown },
        track.id,
        DataStream,
      );
      // nb_samples is the whole track; asking for all of them in one go keeps
      // the callback count down.
      file.setExtractionOptions(track.id, null, { nbSamples: track.nb_samples });
      file.start();
    };
    file.onSamples = (_id, _user, samples) => {
      for (const s of samples) {
        chunks.push(
          new EncodedVideoChunk({
            type: s.is_sync ? "key" : "delta",
            timestamp: (s.cts / s.timescale) * 1e6,
            duration: (s.duration / s.timescale) * 1e6,
            data: s.data as unknown as BufferSource,
          }),
        );
      }
    };

    blob
      .arrayBuffer()
      .then((buffer) => {
        // mp4box wants to know where in the file this buffer starts.
        (buffer as ArrayBuffer & { fileStart: number }).fileStart = 0;
        file.appendBuffer(buffer as never);
        file.flush();
        resolve();
      })
      .catch(reject);
  });

  if (!track) throw new Error("The recording has no video track.");
  if (!chunks.length) throw new Error("The recording has no readable frames.");

  const width = track.video?.width ?? 0;
  const height = track.video?.height ?? 0;
  // Not track.duration: MediaRecorder writes fragmented mp4, where the header
  // durations are written before the fragments exist and stay near zero. The
  // samples are the only honest account of how long the recording is.
  const last = chunks[chunks.length - 1];
  const duration = (last.timestamp + (last.duration ?? 0)) / 1e6;
  const fps = duration > 0 ? chunks.length / duration : 30;

  let config: VideoDecoderConfig | null = null;
  for (const codec of codecCandidates(track.codec, width, height)) {
    const candidate: VideoDecoderConfig = {
      codec,
      codedWidth: width,
      codedHeight: height,
      description,
      hardwareAcceleration: "no-preference",
    };
    const support = await VideoDecoder.isConfigSupported(candidate).catch(
      () => null,
    );
    if (support?.supported) {
      config = candidate;
      break;
    }
  }
  if (!config) {
    throw new Error(`This browser can't decode ${track.codec} frames.`);
  }

  return { chunks, config, width, height, duration, fps, hasAudio };
}
