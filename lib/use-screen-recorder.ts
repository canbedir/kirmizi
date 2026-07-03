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

export interface StartOptions {
  /** Capture the microphone and mix it with system audio. */
  mic?: boolean;
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
  /** A microphone track was captured for this session. */
  micActive: boolean;
  /** The captured mic is currently muted. */
  micMuted: boolean;
  toggleMicMuted: () => void;
  start: (options?: StartOptions) => Promise<void>;
  stop: () => void;
  reset: () => void;
}

export function useScreenRecorder(): UseScreenRecorder {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [recording, setRecording] = useState<Recording | null>(null);
  const [micActive, setMicActive] = useState(false);
  const [micMuted, setMicMuted] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micTrackRef = useRef<MediaStreamTrack | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
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

  const cleanupCapture = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    micStreamRef.current = null;
    micTrackRef.current = null;
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
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
      recorder.stop(); // onstop builds the blob and cleans up capture
    } else {
      cleanupCapture();
    }
  }, [clearTimer, cleanupCapture]);

  const toggleMicMuted = useCallback(() => {
    setMicMuted((prev) => {
      const next = !prev;
      if (micTrackRef.current) micTrackRef.current.enabled = !next;
      return next;
    });
  }, []);

  const start = useCallback(
    async (options?: StartOptions) => {
      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices?.getDisplayMedia
      ) {
        setError("Screen capture isn't available in this browser.");
        setStatus("error");
        return;
      }

      setError(null);
      setStatus("acquiring");

      let display: MediaStream;
      try {
        display = await navigator.mediaDevices.getDisplayMedia({
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

      // Optional microphone — never fail the whole recording if it's denied.
      let mic: MediaStream | null = null;
      if (options?.mic) {
        try {
          mic = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true },
          });
        } catch {
          mic = null;
        }
      }

      // Fresh session — drop any previous recording.
      revokeRecording();
      setRecording(null);

      streamRef.current = display;
      micStreamRef.current = mic;
      micTrackRef.current = mic?.getAudioTracks()[0] ?? null;
      setMicActive(!!micTrackRef.current);
      setMicMuted(false);

      // Mix any audio sources (system + mic) into one destination via Web Audio.
      const audioStreams = [display, mic].filter(
        (s): s is MediaStream => !!s && s.getAudioTracks().length > 0,
      );
      let recordStream = display;
      if (audioStreams.length > 0) {
        const audioCtx = new AudioContext();
        audioCtxRef.current = audioCtx;
        const dest = audioCtx.createMediaStreamDestination();
        for (const s of audioStreams) {
          audioCtx
            .createMediaStreamSource(new MediaStream(s.getAudioTracks()))
            .connect(dest);
        }
        recordStream = new MediaStream([
          ...display.getVideoTracks(),
          ...dest.stream.getAudioTracks(),
        ]);
      }

      chunksRef.current = [];
      const mimeType = pickMimeType();
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(
          recordStream,
          mimeType ? { mimeType } : undefined,
        );
      } catch {
        recorder = new MediaRecorder(recordStream);
      }
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0)
          chunksRef.current.push(event.data);
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
        setMicActive(false);
        cleanupCapture();
      };

      // React to the browser's own "Stop sharing" bar.
      display.getVideoTracks()[0]?.addEventListener("ended", () => stop());

      setElapsedMs(0);
      startedAtRef.current = Date.now();
      recorder.start();
      setStatus("recording");
      timerRef.current = window.setInterval(() => {
        setElapsedMs(Date.now() - startedAtRef.current);
      }, 200);
    },
    [clearTimer, cleanupCapture, revokeRecording, stop],
  );

  const reset = useCallback(() => {
    clearTimer();
    cleanupCapture();
    revokeRecording();
    chunksRef.current = [];
    setRecording(null);
    setElapsedMs(0);
    setError(null);
    setMicActive(false);
    setMicMuted(false);
    setStatus("idle");
  }, [clearTimer, cleanupCapture, revokeRecording]);

  // Tear down on unmount: stop the streams and free the object URL.
  useEffect(() => {
    return () => {
      clearTimer();
      cleanupCapture();
      revokeRecording();
    };
  }, [clearTimer, cleanupCapture, revokeRecording]);

  return {
    status,
    error,
    elapsedMs,
    recording,
    isRecording: status === "recording",
    micActive,
    micMuted,
    toggleMicMuted,
    start,
    stop,
    reset,
  };
}
