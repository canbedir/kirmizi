"use client";

// Turns a demuxed mp4 into something you can ask for a frame by time.
//
// The point of the whole exercise: a VideoDecoder fed its samples in order
// runs several times faster than playback, while seeking a <video> element to
// every frame runs *slower* than playback — each seek makes the browser decode
// from the previous keyframe and throw the rest away. So frames are pulled in
// order and kept, and only a genuine jump backwards costs a reset.

import type { DemuxedVideo } from "@/lib/mp4-demux";

/** Samples in flight before we stop feeding. */
const MAX_DECODE_QUEUE = 24;
/** Decoded frames held before we stop feeding. Each one is a full picture, so
 *  this is the memory knob. */
const MAX_FRAME_QUEUE = 8;

export interface FrameReader {
  /**
   * The frame covering `time` (source seconds), or null before the first frame
   * / after the last. The frame stays owned by the reader — draw from it, but
   * don't close it.
   */
  frameAt: (time: number) => Promise<VideoFrame | null>;
  close: () => void;
}

export function createFrameReader(source: DemuxedVideo): FrameReader {
  const { chunks, config } = source;
  // Where we can restart from, for a jump backwards.
  const keyframes: number[] = [];
  for (let i = 0; i < chunks.length; i++) {
    if (chunks[i].type === "key") keyframes.push(i);
  }
  // Rounding noise shouldn't trigger a reset; a frame either side is invisible.
  const slop = source.fps > 0 ? 1e6 / source.fps : 33_000;

  let queue: VideoFrame[] = [];
  let current: VideoFrame | null = null;
  let ahead: VideoFrame | null = null;
  let fed = 0;
  let flushing = false;
  let drained = false;
  let fatal: Error | null = null;
  let closed = false;
  let wake: (() => void) | null = null;

  const notify = () => {
    const w = wake;
    wake = null;
    w?.();
  };

  const decoder = new VideoDecoder({
    output: (frame) => {
      if (closed) {
        frame.close();
        return;
      }
      queue.push(frame);
      notify();
    },
    error: (e) => {
      fatal = e instanceof Error ? e : new Error(String(e));
      notify();
    },
  });
  decoder.configure(config);

  const pump = () => {
    while (
      fed < chunks.length &&
      decoder.decodeQueueSize < MAX_DECODE_QUEUE &&
      queue.length < MAX_FRAME_QUEUE
    ) {
      decoder.decode(chunks[fed++]);
    }
  };

  /** The next decoded frame, or null once the stream is exhausted. */
  const pull = async (): Promise<VideoFrame | null> => {
    for (;;) {
      if (fatal) throw fatal;
      if (queue.length) return queue.shift()!;
      if (drained) return null;
      pump();
      if (queue.length) return queue.shift()!;
      if (fed >= chunks.length && !flushing) {
        flushing = true;
        decoder
          .flush()
          .then(
            () => {
              drained = true;
            },
            (e) => {
              // A reset while flushing rejects; that's expected, not fatal.
              if (!closed && decoder.state === "closed") {
                fatal = e instanceof Error ? e : new Error(String(e));
              }
            },
          )
          .finally(notify);
      }
      await new Promise<void>((resolve) => {
        wake = resolve;
      });
    }
  };

  const dropFrames = () => {
    for (const frame of queue) frame.close();
    queue = [];
    current?.close();
    current = null;
    ahead?.close();
    ahead = null;
  };

  /** Restart decoding from the last keyframe at or before `us`. */
  const rewind = (us: number) => {
    decoder.reset();
    dropFrames();
    let start = 0;
    for (const index of keyframes) {
      if (chunks[index].timestamp <= us) start = index;
      else break;
    }
    fed = start;
    flushing = false;
    drained = false;
    decoder.configure(config);
  };

  const frameAt = async (time: number): Promise<VideoFrame | null> => {
    if (closed) return null;
    const us = time * 1e6;

    if (current && current.timestamp > us + slop) rewind(us);

    for (;;) {
      if (!ahead) ahead = await pull();
      if (!ahead) break; // end of stream — hold the last frame
      if (current && ahead.timestamp > us) break;
      // No frame yet: take whatever comes first even if it starts late.
      if (!current && ahead.timestamp > us + slop) break;
      current?.close();
      current = ahead;
      ahead = null;
    }
    return current;
  };

  return {
    frameAt,
    close: () => {
      if (closed) return;
      closed = true;
      dropFrames();
      if (decoder.state !== "closed") decoder.close();
      notify();
    },
  };
}
