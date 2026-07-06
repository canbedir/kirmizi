"use client";

import { Camera, Loader2, Mic, Volume2 } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/cn";
import { Switch } from "@/components/ui/switch";
import {
  CameraSettingsDialog,
  RecorderSettings,
  type RecorderSettings as RecorderSettingsType,
} from "@/components/recorder/recorder-settings";

interface IdleControlsProps {
  onStart: () => void;
  acquiring: boolean;
  micEnabled: boolean;
  onMicChange: (enabled: boolean) => void;
  cameraEnabled: boolean;
  onCameraChange: (enabled: boolean) => void;
  settings: RecorderSettingsType;
  onSettingsChange: (patch: Partial<RecorderSettingsType>) => void;
}

export function IdleControls({
  onStart,
  acquiring,
  micEnabled,
  onMicChange,
  cameraEnabled,
  onCameraChange,
  settings,
  onSettingsChange,
}: IdleControlsProps) {
  const reduce = useReducedMotion();

  return (
    <div className="flex flex-col items-center gap-10 text-center">
      <div className="flex flex-col items-center gap-2">
        {/* One clickable unit: the ring, the dot, and the label together. */}
        <button
          type="button"
          onClick={onStart}
          disabled={acquiring}
          className="group flex flex-col items-center gap-5 rounded-2xl p-3 outline-none focus-visible:ring-2 focus-visible:ring-red/40 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="relative grid size-28 place-items-center">
            {/* Slow breathing glow — the button is alive before it's pressed. */}
            <motion.span
              aria-hidden
              className="absolute inset-0 rounded-full bg-red/20 blur-xl"
              animate={
                reduce || acquiring
                  ? { opacity: 0.4 }
                  : { opacity: [0.3, 0.7, 0.3], scale: [1, 1.15, 1] }
              }
              transition={
                reduce || acquiring
                  ? undefined
                  : { duration: 3, repeat: Infinity, ease: "easeInOut" }
              }
            />
            <span className="absolute inset-0 rounded-full border-2 border-red/40 transition-colors duration-300 group-hover:border-red" />
            {acquiring ? (
              <Loader2 className="size-8 animate-spin text-red" />
            ) : (
              <span className="size-12 rounded-full bg-red shadow-[0_0_30px_var(--glow)] transition-transform duration-300 group-hover:scale-110 group-active:scale-95" />
            )}
          </span>

          <span className="font-bold text-3xl leading-tight">
            {acquiring ? "Pick a screen to share" : "Start recording"}
          </span>
        </button>

        <p className="text-sm text-muted-foreground">
          {acquiring
            ? "Choose a screen, window, or tab in the browser prompt."
            : "Your screen, captured entirely on this device."}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <label
          className={cn(
            "inline-flex cursor-pointer items-center gap-2.5 rounded-full border px-3.5 py-2 text-sm transition-colors",
            micEnabled
              ? "border-red/30 bg-red/10 text-foreground"
              : "border-border text-muted-foreground",
          )}
        >
          <Mic className="size-4" />
          Microphone
          <Switch
            checked={micEnabled}
            onCheckedChange={onMicChange}
            disabled={acquiring}
            aria-label="Record microphone"
          />
        </label>

        <span className="inline-flex items-center gap-2 rounded-full border border-border px-3.5 py-2 text-sm text-muted-foreground">
          <Volume2 className="size-4" />
          System audio
          <span className="font-mono text-xs opacity-70">best-effort</span>
        </span>

        <div
          className={cn(
            "inline-flex items-center gap-2.5 rounded-full border py-2 pr-2 pl-3.5 text-sm transition-colors",
            cameraEnabled
              ? "border-red/30 bg-red/10 text-foreground"
              : "border-border text-muted-foreground",
          )}
        >
          <label className="inline-flex cursor-pointer items-center gap-2.5">
            <Camera className="size-4" />
            Camera
            <Switch
              checked={cameraEnabled}
              onCheckedChange={onCameraChange}
              disabled={acquiring}
              aria-label="Record webcam bubble"
            />
          </label>
          {/* Always rendered so toggling the camera doesn't resize the pill. */}
          <span className="h-4 w-px bg-border" aria-hidden />
          <CameraSettingsDialog
            settings={settings}
            onChange={onSettingsChange}
            disabled={!cameraEnabled || acquiring}
          />
        </div>
      </div>

      <RecorderSettings settings={settings} onChange={onSettingsChange} />

      <p className="font-mono text-xs text-muted-foreground/70">
        Press{" "}
        <kbd className="rounded border border-border px-1.5 py-0.5">R</kbd> to
        start recording
      </p>
    </div>
  );
}
