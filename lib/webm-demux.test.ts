import { describe, expect, test } from "bun:test";
import { readBlockHeader, readVint, scanWebm, type WebmFrame } from "@/lib/webm-demux";

/* ---------------------------------------------------------------- */
/* A WebM writer, shaped like the one MediaRecorder uses              */
/* ---------------------------------------------------------------- */

/** An EBML size: the width is encoded as leading zeros plus a marker bit. */
function size(value: number): number[] {
  let width = 1;
  while (width < 8 && value >= 2 ** (7 * width) - 1) width++;
  const out = new Array<number>(width);
  let rest = value;
  for (let i = width - 1; i >= 0; i--) {
    out[i] = rest & 0xff;
    rest = Math.floor(rest / 256);
  }
  out[0] |= 0x80 >> (width - 1);
  return out;
}

/** A big-endian integer, the only way EBML stores one. */
function uint(value: number, width = 0): number[] {
  let w = width;
  if (!w) {
    w = 1;
    while (value >= 256 ** w && w < 8) w++;
  }
  const out = new Array<number>(w);
  let rest = value;
  for (let i = w - 1; i >= 0; i--) {
    out[i] = rest & 0xff;
    rest = Math.floor(rest / 256);
  }
  return out;
}

const UNKNOWN_SIZE = [0xff];

function elem(id: number[], payload: number[]): number[] {
  return [...id, ...size(payload.length), ...payload];
}

/** How a live muxer writes a container it hasn't finished yet. */
function openElem(id: number[], payload: number[]): number[] {
  return [...id, ...UNKNOWN_SIZE, ...payload];
}

const ID = {
  ebml: [0x1a, 0x45, 0xdf, 0xa3],
  segment: [0x18, 0x53, 0x80, 0x67],
  info: [0x15, 0x49, 0xa9, 0x66],
  timecodeScale: [0x2a, 0xd7, 0xb1],
  tracks: [0x16, 0x54, 0xae, 0x6b],
  trackEntry: [0xae],
  trackNumber: [0xd7],
  trackType: [0x83],
  codecId: [0x86],
  codecPrivate: [0x63, 0xa2],
  defaultDuration: [0x23, 0xe3, 0x83],
  video: [0xe0],
  pixelWidth: [0xb0],
  pixelHeight: [0xba],
  cluster: [0x1f, 0x43, 0xb6, 0x75],
  timecode: [0xe7],
  simpleBlock: [0xa3],
  blockGroup: [0xa0],
  block: [0xa1],
  referenceBlock: [0xfb],
  cues: [0x1c, 0x53, 0xbb, 0x6b],
};

function videoTrack(opts: { number: number; width: number; height: number; defaultDuration?: number }) {
  return elem(ID.trackEntry, [
    ...elem(ID.trackNumber, uint(opts.number)),
    ...elem(ID.trackType, [1]),
    ...elem(ID.codecId, [...Buffer.from("V_VP8", "latin1")]),
    ...(opts.defaultDuration
      ? elem(ID.defaultDuration, uint(opts.defaultDuration, 4))
      : []),
    ...elem(ID.video, [
      ...elem(ID.pixelWidth, uint(opts.width, 2)),
      ...elem(ID.pixelHeight, uint(opts.height, 2)),
    ]),
  ]);
}

function audioTrack(number: number) {
  return elem(ID.trackEntry, [
    ...elem(ID.trackNumber, uint(number)),
    ...elem(ID.trackType, [2]),
    ...elem(ID.codecId, [...Buffer.from("A_OPUS", "latin1")]),
  ]);
}

function simpleBlock(
  track: number,
  relative: number,
  key: boolean,
  data: number[],
  lacing = 0,
): number[] {
  const rel = relative < 0 ? relative + 0x10000 : relative;
  return elem(ID.simpleBlock, [
    ...size(track),
    (rel >> 8) & 0xff,
    rel & 0xff,
    (key ? 0x80 : 0) | (lacing << 1),
    ...data,
  ]);
}

/** A Block wrapped in a group, which is how duration and references travel. */
function blockGroup(
  track: number,
  relative: number,
  data: number[],
  references: boolean,
): number[] {
  const rel = relative < 0 ? relative + 0x10000 : relative;
  return elem(ID.blockGroup, [
    ...elem(ID.block, [...size(track), (rel >> 8) & 0xff, rel & 0xff, 0, ...data]),
    ...(references ? elem(ID.referenceBlock, [0x01]) : []),
  ]);
}

interface FileOpts {
  timecodeScale?: number;
  tracks?: number[];
  clusters: { timecode: number; blocks: number[][] }[];
  /** Live muxers leave both the Segment and its Clusters open. */
  closed?: boolean;
  trailing?: number[];
}

function webmFile(opts: FileOpts): Blob {
  const wrap = opts.closed ? elem : openElem;
  const body = [
    ...elem(ID.info, [
      ...elem(ID.timecodeScale, uint(opts.timecodeScale ?? 1_000_000, 3)),
    ]),
    ...elem(ID.tracks, opts.tracks ?? videoTrack({ number: 1, width: 640, height: 360 })),
    ...opts.clusters.flatMap((c) =>
      wrap(ID.cluster, [...elem(ID.timecode, uint(c.timecode, 2)), ...c.blocks.flat()]),
    ),
    ...(opts.trailing ?? []),
  ];
  return new Blob([
    new Uint8Array([...elem(ID.ebml, [0x42, 0x86, 0x81, 0x01]), ...wrap(ID.segment, body)]),
  ]);
}

/** Collect what the scanner emits, which is all the exporter ever sees. */
async function scan(blob: Blob) {
  const frames: WebmFrame[] = [];
  const info = await scanWebm(blob, (f) => frames.push(f));
  return { frames, ...info };
}

/* ---------------------------------------------------------------- */

describe("readVint", () => {
  test("reads a one-byte size without its marker", () => {
    expect(readVint(new Uint8Array([0x82]), 0, false)).toEqual({
      value: 2,
      length: 1,
      unknown: false,
    });
  });

  test("reads a multi-byte size", () => {
    expect(readVint(new Uint8Array([0x40, 0x01]), 0, false)).toEqual({
      value: 1,
      length: 2,
      unknown: false,
    });
  });

  test("keeps the marker for element ids, which is part of the id", () => {
    const bytes = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]);
    expect(readVint(bytes, 0, true)).toEqual({
      value: 0x1a45dfa3,
      length: 4,
      unknown: false,
    });
  });

  test("an all-ones payload is a size nobody has decided yet", () => {
    expect(readVint(new Uint8Array([0xff]), 0, false)?.unknown).toBe(true);
    // Only the payload counts: 0x40 0xff is a real size, not an unknown one.
    expect(readVint(new Uint8Array([0x40, 0xff]), 0, false)?.unknown).toBe(false);
  });

  test("refuses a leading zero byte and a value running off the end", () => {
    expect(readVint(new Uint8Array([0x00, 0x01]), 0, false)).toBeNull();
    expect(readVint(new Uint8Array([0x40]), 0, false)).toBeNull();
    expect(readVint(new Uint8Array([]), 0, false)).toBeNull();
  });
});

describe("readBlockHeader", () => {
  test("reads the track, the offset and the keyframe flag", () => {
    const header = readBlockHeader(new Uint8Array([0x81, 0x00, 0x0a, 0x80, 9, 9]));
    expect(header).toEqual({
      track: 1,
      relative: 10,
      keyframe: true,
      laced: false,
      dataAt: 4,
    });
  });

  test("the offset is signed — a block may precede its cluster", () => {
    const header = readBlockHeader(new Uint8Array([0x81, 0xff, 0xfb, 0x00, 9]));
    expect(header?.relative).toBe(-5);
    expect(header?.keyframe).toBe(false);
  });

  test("notices lacing, whatever kind", () => {
    for (const lacing of [1, 2, 3]) {
      const flags = lacing << 1;
      expect(readBlockHeader(new Uint8Array([0x81, 0, 0, flags, 9]))?.laced).toBe(
        true,
      );
    }
  });

  test("refuses a header the block is too short to hold", () => {
    expect(readBlockHeader(new Uint8Array([0x81, 0x00]))).toBeNull();
  });
});

describe("scanWebm", () => {
  test("reads a live-written file, where nothing declares its size", async () => {
    const { frames, track, hasAudio } = await scan(
      webmFile({
        tracks: [
          ...videoTrack({ number: 1, width: 1280, height: 720 }),
          ...audioTrack(2),
        ],
        clusters: [
          {
            timecode: 0,
            blocks: [
              simpleBlock(1, 0, true, [1]),
              simpleBlock(1, 33, false, [2]),
              simpleBlock(1, 66, false, [3]),
            ],
          },
        ],
      }),
    );

    expect(frames.length).toBe(3);
    expect(track?.number).toBe(1);
    expect(track?.codec).toBe("V_VP8");
    expect(track?.width).toBe(1280);
    expect(track?.height).toBe(720);
    expect(hasAudio).toBe(true);
    expect(frames.map((f) => [...f.data])).toEqual([[1], [2], [3]]);
  });

  test("a frame lasts until the next one starts", async () => {
    const { frames } = await scan(
      webmFile({
        clusters: [
          {
            timecode: 0,
            blocks: [
              simpleBlock(1, 0, true, [1]),
              simpleBlock(1, 40, false, [2]),
              simpleBlock(1, 100, false, [3]),
            ],
          },
        ],
      }),
    );

    expect(frames.map((f) => f.timestamp)).toEqual([0, 40_000, 100_000]);
    expect(frames[0].duration).toBe(40_000);
    expect(frames[1].duration).toBe(60_000);
    // The last frame has no successor, so it keeps the one before it.
    expect(frames[2].duration).toBe(60_000);
  });

  test("timecodes carry across clusters", async () => {
    const { frames } = await scan(
      webmFile({
        clusters: [
          { timecode: 0, blocks: [simpleBlock(1, 0, true, [1]), simpleBlock(1, 40, false, [2])] },
          { timecode: 1000, blocks: [simpleBlock(1, 0, true, [3]), simpleBlock(1, 40, false, [4])] },
        ],
      }),
    );

    expect(frames.map((f) => f.timestamp)).toEqual([0, 40_000, 1_000_000, 1_040_000]);
  });

  test("the timecode scale is honoured, not assumed", async () => {
    // A scale of 100µs per tick rather than the usual millisecond.
    const { frames } = await scan(
      webmFile({
        timecodeScale: 100_000,
        clusters: [
          { timecode: 0, blocks: [simpleBlock(1, 0, true, [1]), simpleBlock(1, 10, false, [2])] },
        ],
      }),
    );

    expect(frames.map((f) => f.timestamp)).toEqual([0, 1_000]);
  });

  test("drops the frames before the first keyframe and rebases onto it", async () => {
    // A decoder handed a delta frame with no keyframe behind it errors out,
    // so those frames can't be passed on however much we'd like the footage.
    const { frames } = await scan(
      webmFile({
        clusters: [
          {
            timecode: 500,
            blocks: [
              simpleBlock(1, 0, false, [1]),
              simpleBlock(1, 20, false, [2]),
              simpleBlock(1, 40, true, [3]),
              simpleBlock(1, 60, false, [4]),
            ],
          },
        ],
      }),
    );

    expect(frames.map((f) => [...f.data])).toEqual([[3], [4]]);
    expect(frames.map((f) => f.timestamp)).toEqual([0, 20_000]);
    expect(frames[0].key).toBe(true);
  });

  test("a grouped block is a keyframe exactly when it references nothing", async () => {
    const { frames } = await scan(
      webmFile({
        clusters: [
          {
            timecode: 0,
            blocks: [
              blockGroup(1, 0, [1], false),
              blockGroup(1, 40, [2], true),
              blockGroup(1, 80, [3], false),
            ],
          },
        ],
      }),
    );

    expect(frames.map((f) => f.key)).toEqual([true, false, true]);
    expect(frames.map((f) => [...f.data])).toEqual([[1], [2], [3]]);
  });

  test("ignores blocks belonging to another track", async () => {
    const { frames } = await scan(
      webmFile({
        tracks: [...videoTrack({ number: 1, width: 640, height: 360 }), ...audioTrack(2)],
        clusters: [
          {
            timecode: 0,
            blocks: [
              simpleBlock(1, 0, true, [1]),
              simpleBlock(2, 0, true, [99]),
              simpleBlock(2, 20, true, [99]),
              simpleBlock(1, 40, false, [2]),
            ],
          },
        ],
      }),
    );

    expect(frames.map((f) => [...f.data])).toEqual([[1], [2]]);
    expect(frames.map((f) => f.timestamp)).toEqual([0, 40_000]);
  });

  test("skips past elements it has no use for", async () => {
    const { frames } = await scan(
      webmFile({
        closed: true,
        clusters: [{ timecode: 0, blocks: [simpleBlock(1, 0, true, [1])] }],
        trailing: elem(ID.cues, [0x01, 0x02, 0x03, 0x04]),
      }),
    );

    expect(frames.length).toBe(1);
  });

  test("keeps what it read when the recording stops mid-write", async () => {
    const whole = webmFile({
      clusters: [
        {
          timecode: 0,
          blocks: [
            simpleBlock(1, 0, true, [1]),
            simpleBlock(1, 40, false, [2]),
            simpleBlock(1, 80, false, [3, 3, 3, 3, 3, 3, 3, 3]),
          ],
        },
      ],
    });
    // A recording interrupted part-way through its last frame.
    const cut = whole.slice(0, whole.size - 6);
    const { frames } = await scan(cut);

    expect(frames.map((f) => [...f.data])).toEqual([[1], [2]]);
  });

  test("falls back rather than guess at laced frames", async () => {
    const blob = webmFile({
      clusters: [
        {
          timecode: 0,
          blocks: [simpleBlock(1, 0, true, [1]), simpleBlock(1, 40, false, [2, 3], 3)],
        },
      ],
    });

    await expect(scan(blob)).rejects.toThrow(/lace/i);
  });

  test("a file with no video track says so", async () => {
    const { track, frames } = await scan(
      webmFile({ tracks: audioTrack(1), clusters: [] }),
    );

    expect(track).toBeNull();
    expect(frames.length).toBe(0);
  });

  test("uses DefaultDuration for a lone frame, which has no gap to measure", async () => {
    const { frames } = await scan(
      webmFile({
        // 20ms per frame, in nanoseconds, as Matroska states it.
        tracks: videoTrack({ number: 1, width: 640, height: 360, defaultDuration: 20_000_000 }),
        clusters: [{ timecode: 0, blocks: [simpleBlock(1, 0, true, [1])] }],
      }),
    );

    expect(frames.length).toBe(1);
    expect(frames[0].duration).toBe(20_000);
  });
});
