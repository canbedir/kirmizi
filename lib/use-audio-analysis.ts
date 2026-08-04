"use client";

// Measures a recording's sound once, in the background, and holds the answer.
//
// Decoding a long recording's audio is a few hundred megabytes for a moment,
// so it happens once and the buffer is dropped as soon as the numbers are out
// of it — what's kept is a handful of floats.

import { useEffect, useState } from "react";
import { analyseSound, type SoundAnalysis } from "@/lib/sound";

export type AudioAnalysisState =
  | { status: "measuring"; analysis: null }
  | { status: "ready"; analysis: SoundAnalysis }
  /** The recording has no sound, or none we could read. */
  | { status: "silent"; analysis: null };

const MEASURING: AudioAnalysisState = { status: "measuring", analysis: null };
const SILENT: AudioAnalysisState = { status: "silent", analysis: null };

export function useAudioAnalysis(blob: Blob | null): AudioAnalysisState {
  // Held against the blob it describes, so a new recording reads as
  // "measuring" from the first render rather than showing the old answer.
  const [done, setDone] = useState<{
    blob: Blob;
    analysis: SoundAnalysis | null;
  } | null>(null);

  useEffect(() => {
    if (!blob) return;
    let live = true;
    analyseSound(blob)
      .then((analysis) => {
        if (live) setDone({ blob, analysis });
      })
      .catch(() => {
        if (live) setDone({ blob, analysis: null });
      });
    return () => {
      live = false;
    };
  }, [blob]);

  if (!blob) return SILENT;
  if (!done || done.blob !== blob) return MEASURING;
  return done.analysis
    ? { status: "ready", analysis: done.analysis }
    : SILENT;
}
