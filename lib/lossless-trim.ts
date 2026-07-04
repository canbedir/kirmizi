"use client";

import type { FFmpeg } from "@ffmpeg/ffmpeg";

export interface TrimSegment {
  start: number;
  end: number;
}

// Single-thread core (no SharedArrayBuffer, so no COOP/COEP headers needed),
// loaded lazily from a CDN on first use.
const CORE_BASE = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd";

let instance: FFmpeg | null = null;
let loadPromise: Promise<void> | null = null;
let progressCb: ((fraction: number) => void) | null = null;

async function ensureFFmpeg(onLoading?: () => void): Promise<FFmpeg> {
  if (!instance) {
    const { FFmpeg } = await import("@ffmpeg/ffmpeg");
    instance = new FFmpeg();
    instance.on("progress", ({ progress }) => {
      progressCb?.(Math.min(1, Math.max(0, progress)));
    });
  }
  const ff = instance;
  if (ff.loaded) return ff;
  if (!loadPromise) {
    onLoading?.();
    loadPromise = (async () => {
      const { toBlobURL } = await import("@ffmpeg/util");
      await ff.load({
        coreURL: await toBlobURL(
          `${CORE_BASE}/ffmpeg-core.js`,
          "text/javascript",
        ),
        wasmURL: await toBlobURL(
          `${CORE_BASE}/ffmpeg-core.wasm`,
          "application/wasm",
        ),
      });
    })();
  }
  await loadPromise;
  return ff;
}

/**
 * Losslessly trim/concat the kept segments by stream-copying (`-c copy`) — no
 * re-encode, so it's fast, keeps the original quality, and the size stays
 * proportional to the duration. Cut points snap to keyframes. Fully in-browser.
 */
export async function losslessTrim(
  source: Blob,
  mimeType: string,
  segments: TrimSegment[],
  opts?: { onLoading?: () => void; onProgress?: (fraction: number) => void },
): Promise<Blob> {
  const ff = await ensureFFmpeg(opts?.onLoading);
  const { fetchFile } = await import("@ffmpeg/util");
  progressCb = opts?.onProgress ?? null;

  const ext = mimeType.includes("mp4") ? "mp4" : "webm";
  const input = `input.${ext}`;
  const output = `output.${ext}`;
  const files: string[] = [input];

  try {
    await ff.writeFile(input, await fetchFile(source));

    const cut = async (seg: TrimSegment, name: string) => {
      await ff.exec([
        "-ss",
        String(seg.start),
        "-i",
        input,
        "-t",
        String(Math.max(0.05, seg.end - seg.start)),
        "-c",
        "copy",
        name,
      ]);
      files.push(name);
    };

    if (segments.length <= 1) {
      await cut(segments[0] ?? { start: 0, end: 0 }, output);
    } else {
      const parts: string[] = [];
      for (let i = 0; i < segments.length; i++) {
        const name = `part${i}.${ext}`;
        await cut(segments[i], name);
        parts.push(name);
      }
      const list = parts.map((p) => `file '${p}'`).join("\n");
      await ff.writeFile("list.txt", new TextEncoder().encode(list));
      files.push("list.txt");
      await ff.exec([
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        "list.txt",
        "-c",
        "copy",
        output,
      ]);
      files.push(output);
    }

    const data = (await ff.readFile(output)) as Uint8Array;
    // Copy into a fresh ArrayBuffer-backed view for the Blob constructor.
    return new Blob([new Uint8Array(data)], { type: mimeType });
  } finally {
    progressCb = null;
    for (const name of files) {
      try {
        await ff.deleteFile(name);
      } catch {
        /* file may not exist */
      }
    }
  }
}
