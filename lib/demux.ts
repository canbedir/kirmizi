"use client";

// The front door to the container parsers.
//
// Chrome and Edge record mp4; Firefox has no mp4 encoder and records WebM.
// Both end up as the same thing here — encoded samples plus a decoder config —
// so the exporter never has to care which one it was handed.

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
 * The encoded samples are held as chunks — about the size of the recording —
 * and the re-encode accumulates alongside them, so there's still a limit; it's
 * just no longer three copies of the file.
 */
export const MAX_INPUT_BYTES = 2 * 1024 * 1024 * 1024;

/** Whether this recording could go through the frame-exact exporter at all. */
export function looksDemuxable(blob: Blob, mimeType: string): boolean {
  if (typeof VideoDecoder === "undefined" || typeof VideoEncoder === "undefined") {
    return false;
  }
  if (blob.size > MAX_INPUT_BYTES) return false;
  const type = (mimeType || blob.type || "").toLowerCase();
  return type.includes("mp4") || type.includes("webm") || type.includes("matroska");
}

/**
 * Which container this actually is, read from the bytes rather than the label.
 * A blob that has been round-tripped through IndexedDB can lose its type, and
 * the webcam recording is passed without one at all — the first few bytes are
 * the only thing that never lies.
 */
async function sniff(blob: Blob): Promise<"mp4" | "webm"> {
  const head = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  // EBML — every Matroska/WebM file starts with this exact magic.
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) {
    return "webm";
  }
  // ISO base media: a box header, whose type is `ftyp`, at offset 4.
  if (head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70) {
    return "mp4";
  }
  throw new Error("The recording isn't in a format this browser can read.");
}

/**
 * Read every encoded video sample out of `blob`, in decode order, along with a
 * decoder config the browser has already agreed to.
 */
export async function demuxVideo(blob: Blob): Promise<DemuxedVideo> {
  if (blob.size > MAX_INPUT_BYTES) {
    throw new Error("The recording is too large to read frame by frame.");
  }
  if (blob.size === 0) throw new Error("The recording is empty.");

  const kind = await sniff(blob);
  if (kind === "webm") {
    const { demuxWebm } = await import("@/lib/webm-demux");
    return demuxWebm(blob);
  }
  const { demuxMp4 } = await import("@/lib/mp4-demux");
  return demuxMp4(blob);
}

/* ---------------------------------------------------------------- */
/* Shared between the two parsers                                    */
/* ---------------------------------------------------------------- */

/**
 * MediaRecorder writes VP9 with a level of 0 — which VideoDecoder rejects as
 * ambiguous. Fill in a level that covers the resolution and let the caller's
 * probe settle which one the browser actually accepts.
 */
export function codecCandidates(
  codec: string,
  width: number,
  height: number,
): string[] {
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

/**
 * Settle on a config the browser says it can decode. Returns the first
 * candidate it accepts, so the caller can offer guesses in preference order.
 */
export async function agreeConfig(
  codecs: string[],
  width: number,
  height: number,
  description: Uint8Array | undefined,
): Promise<VideoDecoderConfig | null> {
  for (const codec of codecs) {
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
    if (support?.supported) return candidate;
  }
  return null;
}
