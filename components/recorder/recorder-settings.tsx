"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { CameraOff, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Resolution } from "@/lib/use-screen-recorder";
import type { CameraShape } from "@/lib/camera-composite";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export interface RecorderSettings {
  resolution: Resolution;
  fps: number;
  countdown: number;
  camX: number;
  camY: number;
  camSize: number;
  camShape: CameraShape;
  camMirror: boolean;
  camBorderColor: string | null;
  camBorderWidth: number;
}

export const DEFAULT_SETTINGS: RecorderSettings = {
  resolution: "auto",
  fps: 30,
  countdown: 3,
  camX: 0.84,
  camY: 0.8,
  camSize: 0.22,
  camShape: "circle",
  camMirror: true,
  camBorderColor: null,
  camBorderWidth: 0.006,
};

// --- persistence -----------------------------------------------------------
const STORAGE_KEY = "kirmizi:recorder-settings";
const SETTINGS_EVENT = "kirmizi:settings";

let cacheRaw: string | null = null;
let cache: RecorderSettings = DEFAULT_SETTINGS;

function readSettings(): RecorderSettings {
  if (typeof localStorage === "undefined") return DEFAULT_SETTINGS;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw !== cacheRaw) {
    cacheRaw = raw;
    try {
      cache = raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
    } catch {
      cache = DEFAULT_SETTINGS;
    }
  }
  return cache;
}

function subscribeSettings(callback: () => void) {
  window.addEventListener(SETTINGS_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(SETTINGS_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

/** Recorder settings persisted to localStorage (SSR-safe, no backend). */
export function useRecorderSettings(): [
  RecorderSettings,
  (patch: Partial<RecorderSettings>) => void,
] {
  const settings = useSyncExternalStore(
    subscribeSettings,
    readSettings,
    () => DEFAULT_SETTINGS,
  );
  const patch = useCallback((next: Partial<RecorderSettings>) => {
    const merged = { ...readSettings(), ...next };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    window.dispatchEvent(new Event(SETTINGS_EVENT));
  }, []);
  return [settings, patch];
}

const BORDERS: { label: string; color: string | null }[] = [
  { label: "None", color: null },
  { label: "White", color: "#FFFFFF" },
  { label: "Black", color: "#0E0D0C" },
  { label: "Red", color: "#F6433A" },
];

type Primitive = string | number | boolean;

function Segmented<T extends Primitive>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-background/50 p-0.5">
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-md px-2.5 py-1 text-sm transition-colors",
            value === option.value
              ? "bg-red/15 text-foreground ring-1 ring-red/30"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

/** Live webcam preview with a draggable bubble over a mock "screen". */
function CameraPreview({
  settings,
  onChange,
}: {
  settings: RecorderSettings;
  onChange: (patch: Partial<RecorderSettings>) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const draggingRef = useRef(false);
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() =>
      setDims({ w: el.clientWidth, h: el.clientHeight }),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { width: 640, height: 480 } })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.play().catch(() => {});
        }
        setReady(true);
      })
      .catch(() => setReady(false));
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const diameter = settings.camSize * dims.h;
  const halfX = dims.w ? diameter / 2 / dims.w : 0;
  const halfY = dims.h ? diameter / 2 / dims.h : 0;
  const borderPx = settings.camBorderColor
    ? Math.max(1, settings.camBorderWidth * dims.h)
    : 0;

  function moveTo(clientX: number, clientY: number) {
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;
    onChange({
      camX: Math.min(1 - halfX, Math.max(halfX, x)),
      camY: Math.min(1 - halfY, Math.max(halfY, y)),
    });
  }

  return (
    <div
      ref={boxRef}
      onPointerMove={(e) => draggingRef.current && moveTo(e.clientX, e.clientY)}
      onPointerUp={() => (draggingRef.current = false)}
      className="relative aspect-video w-full overflow-hidden rounded-xl border border-border bg-linear-to-br from-surface to-background"
    >
      <span className="pointer-events-none absolute inset-0 grid place-items-center font-mono text-xs text-muted-foreground/50">
        your screen
      </span>

      <div
        onPointerDown={(e) => {
          draggingRef.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        style={{
          left: `${settings.camX * 100}%`,
          top: `${settings.camY * 100}%`,
          width: diameter,
          height: diameter,
          transform: "translate(-50%, -50%)",
          borderRadius:
            settings.camShape === "circle" ? "9999px" : `${diameter * 0.2}px`,
          border: borderPx
            ? `${borderPx}px solid ${settings.camBorderColor}`
            : undefined,
        }}
        className="absolute cursor-grab touch-none overflow-hidden bg-black shadow-lg active:cursor-grabbing"
      >
        <video
          ref={videoRef}
          muted
          autoPlay
          playsInline
          className={cn(
            "h-full w-full object-cover",
            settings.camMirror && "-scale-x-100",
          )}
        />
        {!ready && (
          <span className="absolute inset-0 grid place-items-center text-muted-foreground">
            <CameraOff className="size-5" />
          </span>
        )}
      </div>
    </div>
  );
}

/** Inline panel for capture quality — always visible on the idle screen. */
export function RecorderSettings({
  settings,
  onChange,
}: {
  settings: RecorderSettings;
  onChange: (patch: Partial<RecorderSettings>) => void;
}) {
  return (
    <div className="w-full max-w-md space-y-3.5 rounded-xl border border-border bg-surface/50 p-4 text-left">
      <Row label="Resolution">
        <Segmented
          value={settings.resolution}
          onChange={(resolution) => onChange({ resolution })}
          options={[
            { value: "auto", label: "Auto" },
            { value: "1080p", label: "1080p" },
            { value: "720p", label: "720p" },
          ]}
        />
      </Row>
      <Row label="Frame rate">
        <Segmented
          value={settings.fps}
          onChange={(fps) => onChange({ fps })}
          options={[
            { value: 30, label: "30" },
            { value: 60, label: "60" },
          ]}
        />
      </Row>
      <Row label="Countdown">
        <Segmented
          value={settings.countdown}
          onChange={(countdown) => onChange({ countdown })}
          options={[
            { value: 0, label: "Off" },
            { value: 3, label: "3s" },
            { value: 5, label: "5s" },
          ]}
        />
      </Row>
    </div>
  );
}

/** Modal for the webcam bubble — opened from a control near the camera toggle. */
export function CameraSettingsDialog({
  settings,
  onChange,
  disabled,
}: {
  settings: RecorderSettings;
  onChange: (patch: Partial<RecorderSettings>) => void;
  disabled?: boolean;
}) {
  return (
    <Dialog>
      <DialogTrigger
        disabled={disabled}
        aria-label="Camera settings"
        title="Camera settings"
        className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-red/10 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
      >
        <SlidersHorizontal className="size-4" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Camera bubble</DialogTitle>
          <DialogDescription>
            Drag it where you want, then tweak size, shape, and border.
          </DialogDescription>
        </DialogHeader>

        <CameraPreview settings={settings} onChange={onChange} />

        <div className="space-y-3.5">
          <Row label="Size">
            <div className="w-40">
              <Slider
                min={0.1}
                max={0.4}
                step={0.01}
                value={[settings.camSize]}
                onValueChange={(v) => {
                  const next = Array.isArray(v) ? v[0] : v;
                  onChange({ camSize: next });
                }}
                aria-label="Camera size"
              />
            </div>
          </Row>
          <Row label="Shape">
            <Segmented
              value={settings.camShape}
              onChange={(camShape) => onChange({ camShape })}
              options={[
                { value: "circle", label: "Circle" },
                { value: "rounded", label: "Square" },
              ]}
            />
          </Row>
          <Row label="Mirror">
            <Segmented
              value={settings.camMirror}
              onChange={(camMirror) => onChange({ camMirror })}
              options={[
                { value: true, label: "On" },
                { value: false, label: "Off" },
              ]}
            />
          </Row>
          <Row label="Border">
            <div className="flex items-center gap-1.5">
              {BORDERS.map((border) => {
                const active = settings.camBorderColor === border.color;
                return (
                  <button
                    key={border.label}
                    type="button"
                    aria-label={border.label}
                    title={border.label}
                    onClick={() => onChange({ camBorderColor: border.color })}
                    className={cn(
                      "grid size-6 place-items-center rounded-full border transition-transform",
                      active
                        ? "border-red ring-2 ring-red/40"
                        : "border-border hover:scale-110",
                    )}
                    style={
                      border.color ? { backgroundColor: border.color } : undefined
                    }
                  >
                    {!border.color && (
                      <span className="text-[10px] text-muted-foreground">⃠</span>
                    )}
                  </button>
                );
              })}
            </div>
          </Row>
          {settings.camBorderColor && (
            <Row label="Border width">
              <Segmented
                value={settings.camBorderWidth}
                onChange={(camBorderWidth) => onChange({ camBorderWidth })}
                options={[
                  { value: 0.005, label: "Thin" },
                  { value: 0.012, label: "Thick" },
                ]}
              />
            </Row>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
