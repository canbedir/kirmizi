"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { composeCameraPip, type CameraComposite } from "@/lib/camera-composite";

export type RecorderStatus =
  | "idle"
  | "acquiring"
  | "countdown"
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
  /** Composite a webcam bubble into the corner of the recording. */
  camera?: boolean;
  /** Seconds of 3·2·1 countdown after the screen is picked (default 3). */
  countdown?: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
  /** The stream being recorded (video + mixed audio), for a live preview. */
  previewStream: MediaStream | null;
  /** Current countdown value while status is "countdown" (else 0). */
  countdown: number;
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
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const [countdown, setCountdown] = useState(0);
  // Set when the user aborts (stop / reset / native stop) during the countdown.
  const startAbortedRef = useRef(false);

  const streamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micTrackRef = useRef<MediaStreamTrack | null>(null);
  const camStreamRef = useRef<MediaStream | null>(null);
  const compositeRef = useRef<CameraComposite | null>(null);
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
    compositeRef.current?.stop();
    compositeRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    micStreamRef.current = null;
    micTrackRef.current = null;
    camStreamRef.current?.getTracks().forEach((track) => track.stop());
    camStreamRef.current = null;
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
    startAbortedRef.current = true; // no-op mid-recording, cancels the countdown
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
      startAbortedRef.current = false;
      setStatus("acquiring");

      let display: MediaStream;
      try {
        display = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: 30 },
          // Disable speech-oriented processing — it mangles music/system audio.
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
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

      // Optional webcam for the picture-in-picture bubble.
      let cam: MediaStream | null = null;
      if (options?.camera) {
        try {
          cam = await navigator.mediaDevices.getUserMedia({
            video: { width: 1280, height: 720 },
          });
        } catch {
          cam = null;
        }
      }

      // Fresh session — drop any previous recording.
      revokeRecording();
      setRecording(null);

      streamRef.current = display;
      micStreamRef.current = mic;
      micTrackRef.current = mic?.getAudioTracks()[0] ?? null;
      camStreamRef.current = cam;
      setMicActive(!!micTrackRef.current);
      setMicMuted(false);

      // Audio: only run the Web Audio mixer when we must combine two sources
      // (mic + system). A single source is passed straight through, keeping
      // system audio at full quality (no resample round-trip).
      const displayHasAudio = display.getAudioTracks().length > 0;
      const micHasAudio = !!mic && mic.getAudioTracks().length > 0;
      let audioTracks: MediaStreamTrack[] = [];
      if (displayHasAudio && micHasAudio) {
        const audioCtx = new AudioContext();
        audioCtxRef.current = audioCtx;
        const dest = audioCtx.createMediaStreamDestination();
        for (const s of [display, mic as MediaStream]) {
          audioCtx
            .createMediaStreamSource(new MediaStream(s.getAudioTracks()))
            .connect(dest);
        }
        audioTracks = dest.stream.getAudioTracks();
      } else if (micHasAudio) {
        audioTracks = (mic as MediaStream).getAudioTracks();
      } else if (displayHasAudio) {
        audioTracks = display.getAudioTracks();
      }

      // Video: composite the webcam bubble when a camera was granted, else use
      // the screen track directly.
      let videoTracks = display.getVideoTracks();
      if (cam) {
        try {
          const composite = await composeCameraPip(display, cam);
          compositeRef.current = composite;
          videoTracks = composite.stream.getVideoTracks();
        } catch {
          videoTracks = display.getVideoTracks();
        }
      }

      const recordStream = new MediaStream([...videoTracks, ...audioTracks]);

      chunksRef.current = [];
      const mimeType = pickMimeType();
      let recorder: MediaRecorder;
      try {
        const options: MediaRecorderOptions = { audioBitsPerSecond: 192_000 };
        if (mimeType) options.mimeType = mimeType;
        recorder = new MediaRecorder(recordStream, options);
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
        setPreviewStream(null);
        cleanupCapture();
      };

      // React to the browser's own "Stop sharing" bar.
      display.getVideoTracks()[0]?.addEventListener("ended", () => stop());

      // 3·2·1 countdown after the screen is picked, before recording begins.
      const seconds = Math.max(0, Math.floor(options?.countdown ?? 3));
      if (seconds > 0) {
        setStatus("countdown");
        for (let n = seconds; n > 0; n--) {
          if (startAbortedRef.current) break;
          setCountdown(n);
          await sleep(1000);
        }
      }
      setCountdown(0);

      // Bail out if the user cancelled (native stop / Escape) during the count.
      if (startAbortedRef.current) {
        cleanupCapture();
        setMicActive(false);
        setStatus("idle");
        return;
      }

      setElapsedMs(0);
      startedAtRef.current = Date.now();
      setPreviewStream(recordStream);
      recorder.start();
      setStatus("recording");
      timerRef.current = window.setInterval(() => {
        setElapsedMs(Date.now() - startedAtRef.current);
      }, 200);
    },
    [clearTimer, cleanupCapture, revokeRecording, stop],
  );

  const reset = useCallback(() => {
    startAbortedRef.current = true;
    clearTimer();
    cleanupCapture();
    revokeRecording();
    chunksRef.current = [];
    setRecording(null);
    setElapsedMs(0);
    setCountdown(0);
    setError(null);
    setMicActive(false);
    setMicMuted(false);
    setPreviewStream(null);
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
    previewStream,
    countdown,
    micActive,
    micMuted,
    toggleMicMuted,
    start,
    stop,
    reset,
  };
}
