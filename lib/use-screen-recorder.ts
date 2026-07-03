"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type RecorderStatus =
  | "idle"
  | "acquiring"
  | "recording"
  | "stopped"
  | "error";

export interface Recording {
  url: string;
  blob: Blob;
  mimeType: string;
  size: number;
  durationMs: number;
}

// Prefer mp4 (H.264) where the browser can encode it, else fall back to webm.
const MIME_CANDIDATES = [
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  return MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

export interface UseScreenRecorder {
  status: RecorderStatus;
  error: string | null;
  /** Milliseconds elapsed while recording. */
  elapsedMs: number;
  /** The finished recording, available once status is "stopped". */
  recording: Recording | null;
  isRecording: boolean;
  start: () => Promise<void>;
  stop: () => void;
  reset: () => void;
}

export function useScreenRecorder(): UseScreenRecorder {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [recording, setRecording] = useState<Recording | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  // Kept in a ref so cleanup can revoke the object URL without re-renders.
  const recordingRef = useRef<Recording | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const revokeRecording = useCallback(() => {
    if (recordingRef.current) {
      URL.revokeObjectURL(recordingRef.current.url);
      recordingRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    clearTimer();
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop(); // onstop builds the blob and stops the tracks
    } else {
      stopTracks();
    }
  }, [clearTimer, stopTracks]);

  const start = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getDisplayMedia) {
      setError("Screen capture isn't available in this browser.");
      setStatus("error");
      return;
    }

    setError(null);
    setStatus("acquiring");

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: true, // system/tab audio when the browser + OS allow it
      });
    } catch (err) {
      // Cancelling the native picker rejects — treat that as a quiet no-op.
      if (
        err instanceof DOMException &&
        (err.name === "NotAllowedError" || err.name === "AbortError")
      ) {
        setStatus("idle");
        return;
      }
      setError(err instanceof Error ? err.message : "Couldn't start capture.");
      setStatus("error");
      return;
    }

    // Fresh session — drop any previous recording.
    revokeRecording();
    setRecording(null);

    streamRef.current = stream;
    chunksRef.current = [];

    const mimeType = pickMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch {
      recorder = new MediaRecorder(stream);
    }
    recorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
    };

    recorder.onstop = () => {
      clearTimer();
      const type = recorder.mimeType || mimeType || "video/webm";
      const blob = new Blob(chunksRef.current, { type });
      const url = URL.createObjectURL(blob);
      const finished: Recording = {
        url,
        blob,
        mimeType: type,
        size: blob.size,
        durationMs: Date.now() - startedAtRef.current,
      };
      recordingRef.current = finished;
      setRecording(finished);
      setStatus("stopped");
      stopTracks();
    };

    // React to the browser's own "Stop sharing" bar.
    stream.getVideoTracks()[0]?.addEventListener("ended", () => stop());

    setElapsedMs(0);
    startedAtRef.current = Date.now();
    recorder.start();
    setStatus("recording");
    timerRef.current = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAtRef.current);
    }, 200);
  }, [clearTimer, revokeRecording, stop, stopTracks]);

  const reset = useCallback(() => {
    clearTimer();
    stopTracks();
    revokeRecording();
    chunksRef.current = [];
    setRecording(null);
    setElapsedMs(0);
    setError(null);
    setStatus("idle");
  }, [clearTimer, revokeRecording, stopTracks]);

  // Tear down on unmount: stop the stream and free the object URL.
  useEffect(() => {
    return () => {
      clearTimer();
      stopTracks();
      revokeRecording();
    };
  }, [clearTimer, stopTracks, revokeRecording]);

  return {
    status,
    error,
    elapsedMs,
    recording,
    isRecording: status === "recording",
    start,
    stop,
    reset,
  };
}
