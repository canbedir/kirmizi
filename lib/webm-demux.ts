"use client";

// Pull the encoded video samples out of a WebM so WebCodecs can decode them
// directly, instead of playing the file back through a <video> element in real
// time. Everything here is container work — no pixels are touched.
//
// This is the Firefox path. Firefox has no mp4 encoder, so MediaRecorder there
// writes WebM (VP8 + Opus); without this the whole frame-exact exporter was
// unreachable and every Firefox export ran at playback speed.
//
// MediaRecorder writes WebM for *streaming*, which looks nothing like the tidy
// file the format's examples show: the Segment and its Clusters are written
// with unknown sizes, Info.Duration is 0, and there are no Cues. So nothing
// here may depend on a size being declared or on an index existing.

import { agreeConfig, codecCandidates, type DemuxedVideo } from "@/lib/demux";

/** How much of the recording is in memory at once while demuxing. */
const READ_CHUNK = 8 * 1024 * 1024;

/** Guards against a corrupt size field turning into a huge allocation. */
const MAX_HEADER_ELEMENT = 32 * 1024 * 1024;

const ID_SEGMENT = 0x18538067;
const ID_INFO = 0x1549a966;
const ID_TIMECODE_SCALE = 0x2ad7b1;
const ID_TRACKS = 0x1654ae6b;
const ID_TRACK_ENTRY = 0xae;
const ID_TRACK_NUMBER = 0xd7;
const ID_TRACK_TYPE = 0x83;
const ID_CODEC_ID = 0x86;
const ID_CODEC_PRIVATE = 0x63a2;
const ID_DEFAULT_DURATION = 0x23e383;
const ID_VIDEO = 0xe0;
const ID_PIXEL_WIDTH = 0xb0;
const ID_PIXEL_HEIGHT = 0xba;
const ID_CLUSTER = 0x1f43b675;
const ID_TIMECODE = 0xe7;
const ID_SIMPLE_BLOCK = 0xa3;
const ID_BLOCK_GROUP = 0xa0;
const ID_BLOCK = 0xa1;
const ID_REFERENCE_BLOCK = 0xfb;

const TRACK_TYPE_VIDEO = 1;
const TRACK_TYPE_AUDIO = 2;

/* ---------------------------------------------------------------- */
/* EBML primitives                                                   */
/* ---------------------------------------------------------------- */

/**
 * An EBML variable-length integer. The number of leading zero bits in the
 * first byte gives the width; the first set bit is a marker.
 *
 * Element ids keep the marker (it's part of the id). Sizes drop it, and a
 * payload of all ones means "unknown", which is how a live muxer says it
 * doesn't yet know how long something will be.
 */
export function readVint(
  bytes: Uint8Array,
  at: number,
  keepMarker: boolean,
): { value: number; length: number; unknown: boolean } | null {
  if (at >= bytes.length) return null;
  const first = bytes[at];
  if (first === 0) return null; // 5+ byte ids don't exist in practice
  let length = 1;
  while (length <= 8 && !(first & (0x80 >> (length - 1)))) length++;
  if (length > 8 || at + length > bytes.length) return null;

  if (keepMarker) {
    let value = 0;
    for (let i = 0; i < length; i++) value = value * 256 + bytes[at + i];
    return { value, length, unknown: false };
  }

  let value = first & (0xff >> length);
  let unknown = value === 0xff >> length;
  for (let i = 1; i < length; i++) {
    value = value * 256 + bytes[at + i];
    if (bytes[at + i] !== 0xff) unknown = false;
  }
  return { value, length, unknown };
}

/** A big-endian unsigned integer, as EBML stores every integer. */
function readUint(bytes: Uint8Array, at: number, length: number): number {
  let value = 0;
  for (let i = 0; i < length; i++) value = value * 256 + bytes[at + i];
  return value;
}

/**
 * Walk the children of a master element already held in memory. Used for the
 * small ones — Info, Tracks, a BlockGroup — where reading the whole thing is
 * simpler than threading async reads through every level.
 */
function eachChild(
  bytes: Uint8Array,
  visit: (id: number, body: Uint8Array) => void,
): void {
  let at = 0;
  while (at < bytes.length) {
    const id = readVint(bytes, at, true);
    if (!id) return;
    const size = readVint(bytes, at + id.length, false);
    if (!size) return;
    const start = at + id.length + size.length;
    // An unknown size inside one of these means a muxer we don't understand;
    // stopping is better than guessing at the boundary.
    if (size.unknown) return;
    const end = Math.min(start + size.value, bytes.length);
    visit(id.value, bytes.subarray(start, end));
    at = start + size.value;
  }
}

/* ---------------------------------------------------------------- */
/* Reading the blob                                                  */
/* ---------------------------------------------------------------- */

/**
 * A sliding window onto the recording. Only one chunk is resident at a time,
 * so the parser's own footprint stays flat however long the recording is.
 * Reads only ever move forwards.
 */
class Window {
  private base = 0;
  private buf = new Uint8Array(0);

  constructor(private readonly blob: Blob) {}

  /**
   * The bytes at `[at, at + length)`, or null when the file ends first — a
   * recording cut short mid-write is a real thing, and the frames before the
   * cut are still worth having.
   *
   * The view is only valid until the next call.
   */
  async need(at: number, length: number): Promise<Uint8Array | null> {
    if (at < 0 || at + length > this.blob.size) return null;
    const offset = at - this.base;
    if (offset >= 0 && offset + length <= this.buf.length) {
      return this.buf.subarray(offset, offset + length);
    }
    const want = Math.max(length, READ_CHUNK);
    const end = Math.min(this.blob.size, at + want);
    this.buf = new Uint8Array(await this.blob.slice(at, end).arrayBuffer());
    this.base = at;
    if (this.buf.length < length) return null;
    return this.buf.subarray(0, length);
  }
}

/* ---------------------------------------------------------------- */
/* Tracks                                                            */
/* ---------------------------------------------------------------- */

export interface VideoTrack {
  number: number;
  codec: string;
  width: number;
  height: number;
  description?: Uint8Array;
  /** Nanoseconds, when the file declares one. */
  defaultDuration?: number;
}

/**
 * The WebCodecs codec strings a Matroska CodecID maps to, in the order worth
 * trying. VP8 and VP9 are what browsers record; the rest are here so a file
 * from somewhere else doesn't fall over.
 */
function codecStrings(
  codecId: string,
  width: number,
  height: number,
  privateData: Uint8Array | undefined,
): string[] {
  if (codecId === "V_VP8") return ["vp8"];
  if (codecId === "V_VP9") return codecCandidates("vp09.00.00.08", width, height);
  if (codecId === "V_AV1") return ["av01.0.04M.08", "av01.0.08M.08"];
  if (codecId.startsWith("V_MPEG4/ISO/AVC")) {
    // The avcC's profile / constraints / level bytes name the codec exactly.
    if (privateData && privateData.length >= 4) {
      const hex = (n: number) => n.toString(16).padStart(2, "0").toUpperCase();
      return [
        `avc1.${hex(privateData[1])}${hex(privateData[2])}${hex(privateData[3])}`,
        "avc1.42E01F",
      ];
    }
    return ["avc1.42E01F"];
  }
  if (codecId.startsWith("V_MPEGH/ISO/HEVC")) return ["hev1.1.6.L93.B0"];
  return [];
}

function parseTracks(bytes: Uint8Array): {
  video: VideoTrack | null;
  hasAudio: boolean;
} {
  let video: VideoTrack | null = null;
  let hasAudio = false;

  eachChild(bytes, (id, body) => {
    if (id !== ID_TRACK_ENTRY) return;

    let number = 0;
    let type = 0;
    let codecId = "";
    let width = 0;
    let height = 0;
    let description: Uint8Array | undefined;
    let defaultDuration: number | undefined;

    eachChild(body, (childId, child) => {
      switch (childId) {
        case ID_TRACK_NUMBER:
          number = readUint(child, 0, child.length);
          break;
        case ID_TRACK_TYPE:
          type = readUint(child, 0, child.length);
          break;
        case ID_CODEC_ID:
          codecId = new TextDecoder().decode(child);
          break;
        case ID_CODEC_PRIVATE:
          // Copied: `child` is a view into a buffer that gets reused.
          description = new Uint8Array(child);
          break;
        case ID_DEFAULT_DURATION:
          defaultDuration = readUint(child, 0, child.length);
          break;
        case ID_VIDEO:
          eachChild(child, (vid, v) => {
            if (vid === ID_PIXEL_WIDTH) width = readUint(v, 0, v.length);
            if (vid === ID_PIXEL_HEIGHT) height = readUint(v, 0, v.length);
          });
          break;
      }
    });

    if (type === TRACK_TYPE_AUDIO) hasAudio = true;
    // First video track wins, which is the same rule the mp4 path uses.
    if (type === TRACK_TYPE_VIDEO && !video) {
      video = { number, codec: codecId, width, height, description, defaultDuration };
    }
  });

  return { video, hasAudio };
}

/* ---------------------------------------------------------------- */
/* Blocks                                                            */
/* ---------------------------------------------------------------- */

interface BlockHeader {
  track: number;
  /** Ticks relative to the cluster's own timecode. */
  relative: number;
  keyframe: boolean;
  laced: boolean;
  /** Where the frame data starts, relative to the block body. */
  dataAt: number;
}

/**
 * A Block's fixed header: the track as a vint, a signed 16-bit offset from the
 * cluster's timecode, and a flags byte.
 */
export function readBlockHeader(body: Uint8Array): BlockHeader | null {
  const track = readVint(body, 0, false);
  if (!track || body.length < track.length + 3) return null;
  const at = track.length;
  // Signed: a block may sit slightly before its cluster's timecode.
  const raw = (body[at] << 8) | body[at + 1];
  const relative = raw >= 0x8000 ? raw - 0x10000 : raw;
  const flags = body[at + 2];
  return {
    track: track.value,
    relative,
    keyframe: (flags & 0x80) !== 0,
    laced: ((flags >> 1) & 0x03) !== 0,
    dataAt: at + 3,
  };
}

/* ---------------------------------------------------------------- */
/* Scan                                                              */
/* ---------------------------------------------------------------- */

export interface WebmFrame {
  /** Microseconds from the first kept frame. */
  timestamp: number;
  /** Microseconds. */
  duration: number;
  key: boolean;
  data: Uint8Array;
}

export interface WebmScan {
  track: VideoTrack | null;
  hasAudio: boolean;
}

/**
 * Walk the file and hand each video frame to `onFrame` as it becomes
 * complete. Frames are pushed rather than collected so nothing holds a second
 * copy of the recording — and so this can be exercised without WebCodecs.
 */
export async function scanWebm(
  blob: Blob,
  onFrame: (frame: WebmFrame) => void,
): Promise<WebmScan> {
  const window = new Window(blob);

  /** Nanoseconds per cluster/block tick. The spec's default. */
  let timecodeScale = 1_000_000;
  let track: VideoTrack | null = null;
  let hasAudio = false;
  let clusterTime = 0;

  /**
   * WebM carries no per-frame duration, so a frame's length is the gap to the
   * one after it — which means each frame can only be written once the next
   * has arrived. Holding exactly one back costs a frame of memory; collecting
   * them all first would cost a second copy of the recording.
   */
  let pending: { stamp: number; key: boolean; data: Uint8Array } | null = null;
  let base: number | null = null;
  let lastDuration = 0;

  /** Micros for a block, from its cluster's timecode plus its own offset. */
  const stampOf = (relative: number) =>
    Math.round(((clusterTime + relative) * timecodeScale) / 1000);

  /** Write the held-back frame, now that we know how long it was on screen. */
  const flush = (nextStamp: number | null) => {
    if (!pending || base === null) return;
    const gap = nextStamp === null ? 0 : nextStamp - pending.stamp;
    // The last frame has no successor, and a recording can repeat a timestamp;
    // either way the frame before it is the best available answer.
    const duration =
      gap > 0
        ? gap
        : lastDuration ||
          (track?.defaultDuration
            ? Math.round(track.defaultDuration / 1000)
            : 33_333);
    lastDuration = duration;
    onFrame({
      // Rebased so the first frame starts at zero, as the mp4 path's do.
      timestamp: pending.stamp - base,
      duration,
      key: pending.key,
      data: pending.data,
    });
    pending = null;
  };

  const takeBlock = (body: Uint8Array, forceKey?: boolean) => {
    const header = readBlockHeader(body);
    if (!header || !track || header.track !== track.number) return;
    if (header.laced) {
      // Video is never laced in practice, and guessing at the frame boundaries
      // would produce chunks that decode to nonsense. Better to hand the job
      // back to the exporter that plays the file instead.
      throw new Error("This recording laces its video frames.");
    }
    const key = forceKey ?? header.keyframe;
    const stamp = stampOf(header.relative);
    // Frames before the first keyframe can't be decoded on their own — a
    // decoder fed them errors out rather than skipping them.
    if (base === null) {
      if (!key) return;
      base = stamp;
    }
    flush(stamp);
    pending = {
      stamp,
      key,
      // Copied: `body` is a view into a buffer the next read replaces.
      data: new Uint8Array(body.subarray(header.dataAt)),
    };
  };

  let at = 0;
  // Anything unreadable ends the walk rather than the export: whatever was
  // collected up to that point is a valid, shorter recording.
  parse: while (at < blob.size) {
    const head = await window.need(at, Math.min(12, blob.size - at));
    if (!head) break;
    const id = readVint(head, 0, true);
    if (!id) break;
    const size = readVint(head, id.length, false);
    if (!size) break;
    const body = at + id.length + size.length;

    switch (id.value) {
      // Descended into rather than skipped: both are written with unknown
      // sizes by a live muxer, so their children are simply what comes next.
      case ID_SEGMENT:
      case ID_CLUSTER:
        at = body;
        continue;

      case ID_TIMECODE: {
        const bytes = await window.need(body, size.value);
        if (!bytes) break parse;
        clusterTime = readUint(bytes, 0, size.value);
        break;
      }

      case ID_INFO:
      case ID_TRACKS:
      case ID_BLOCK_GROUP: {
        if (size.unknown || size.value > MAX_HEADER_ELEMENT) break parse;
        const bytes = await window.need(body, size.value);
        if (!bytes) break parse;

        if (id.value === ID_INFO) {
          eachChild(bytes, (childId, child) => {
            if (childId === ID_TIMECODE_SCALE) {
              timecodeScale = readUint(child, 0, child.length) || timecodeScale;
            }
          });
        } else if (id.value === ID_TRACKS) {
          const found = parseTracks(bytes);
          hasAudio ||= found.hasAudio;
          track ??= found.video;
        } else {
          // A Block in a group is a keyframe exactly when nothing references
          // another frame — that's what BlockGroup exists to say.
          let block: Uint8Array | null = null;
          let referenced = false;
          eachChild(bytes, (childId, child) => {
            if (childId === ID_BLOCK) block = child;
            if (childId === ID_REFERENCE_BLOCK) referenced = true;
          });
          if (block) takeBlock(block, !referenced);
        }
        break;
      }

      case ID_SIMPLE_BLOCK: {
        if (size.unknown) break parse;
        const bytes = await window.need(body, size.value);
        if (!bytes) break parse;
        takeBlock(bytes);
        break;
      }

      // The EBML header, SeekHead, Cues, Tags, Void — nothing we need.
      default:
        if (size.unknown) break parse;
        break;
    }

    if (size.unknown) break;
    at = body + size.value;
  }

  flush(null);
  return { track, hasAudio };
}

/* ---------------------------------------------------------------- */
/* Demux                                                             */
/* ---------------------------------------------------------------- */

export async function demuxWebm(blob: Blob): Promise<DemuxedVideo> {
  const chunks: EncodedVideoChunk[] = [];
  const { track, hasAudio } = await scanWebm(blob, (frame) => {
    chunks.push(
      new EncodedVideoChunk({
        type: frame.key ? "key" : "delta",
        timestamp: frame.timestamp,
        duration: frame.duration,
        data: frame.data,
      }),
    );
  });

  if (!track) throw new Error("The recording has no video track.");
  if (!chunks.length) throw new Error("The recording has no readable frames.");

  const { width, height } = track;
  if (!width || !height) throw new Error("The recording has no frame size.");

  const codecs = codecStrings(track.codec, width, height, track.description);
  if (!codecs.length) {
    throw new Error(`This browser can't decode ${track.codec} frames.`);
  }
  // VP8 and VP9 carry everything the decoder needs in the frames themselves;
  // handing them the CodecPrivate some muxers write is what makes Chrome
  // reject the config.
  const description =
    track.codec === "V_VP8" || track.codec === "V_VP9"
      ? undefined
      : track.description;
  const config = await agreeConfig(codecs, width, height, description);
  if (!config) throw new Error(`This browser can't decode ${track.codec} frames.`);

  const last = chunks[chunks.length - 1];
  const duration = (last.timestamp + (last.duration ?? 0)) / 1e6;
  const fps = duration > 0 ? chunks.length / duration : 30;

  return { chunks, config, width, height, duration, fps, hasAudio };
}
