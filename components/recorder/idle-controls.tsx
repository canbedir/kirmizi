"use client";

import { Camera, Loader2, Mic, Volume2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { Switch } from "@/components/ui/switch";

interface IdleControlsProps {
  onStart: () => void;
  acquiring: boolean;
  micEnabled: boolean;
  onMicChange: (enabled: boolean) => void;
}

export function IdleControls({
  onStart,
  acquiring,
  micEnabled,
  onMicChange,
}: IdleControlsProps) {
  return (
    <div className="flex flex-col items-center gap-10 text-center">
      <div className="flex flex-col items-center gap-5">
        <button
          type="button"
          onClick={onStart}
          disabled={acquiring}
          aria-label="Start recording"
          className="group grid size-28 place-items-center rounded-full border-2 border-red/40 outline-none transition-all duration-300 hover:border-red focus-visible:ring-4 focus-visible:ring-red/30 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {acquiring ? (
            <Loader2 className="size-8 animate-spin text-red" />
          ) : (
            <span className="size-12 rounded-full bg-red shadow-[0_0_30px_var(--glow)] transition-transform duration-300 group-hover:scale-110" />
          )}
        </button>

        <div className="space-y-1">
          <p className="font-serif text-3xl leading-tight">
            {acquiring ? "Pick a screen to share" : "Start recording"}
          </p>
          <p className="text-sm text-muted-foreground">
            {acquiring
              ? "Choose a screen, window, or tab in the browser prompt."
              : "Your screen, captured entirely on this device."}
          </p>
        </div>
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

        <span className="inline-flex items-center gap-2 rounded-full border border-dashed border-border px-3.5 py-2 text-sm text-muted-foreground/70">
          <Camera className="size-4" />
          Camera
          <span className="font-mono text-xs opacity-70">soon</span>
        </span>
      </div>

      <p className="max-w-sm text-sm text-muted-foreground">
        Nothing leaves your browser. The recording is built on your device and
        downloaded straight to you — no account, no upload.
      </p>

      <p className="font-mono text-xs text-muted-foreground/70">
        Press{" "}
        <kbd className="rounded border border-border px-1.5 py-0.5">R</kbd> to
        start recording
      </p>
    </div>
  );
}
