"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { motion, useReducedMotion } from "motion/react";
import { CameraOff, MicOff, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Quality, Resolution } from "@/lib/use-screen-recorder";
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
  quality: Quality;
  countdown: number;
  micDeviceId: string | null;
  camDeviceId: string | null;
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
  quality: "high",
  countdown: 3,
  micDeviceId: null,
  camDeviceId: null,
  camX: 0.84,
  camY: 0.8,
  camSize: 0.22,
  camShape: "circle",
  camMirror: true,
  camBorderColor: null,
  camBorderWidth: 0.006,
};

/** The camera-bubble subset of the defaults, for the dialog's reset action. */
export const DEFAULT_CAMERA_SETTINGS: Pick<
  RecorderSettings,
  | "camDeviceId"
  | "camX"
  | "camY"
  | "camSize"
  | "camShape"
  | "camMirror"
  | "camBorderColor"
  | "camBorderWidth"
> = {
  camDeviceId: DEFAULT_SETTINGS.camDeviceId,
  camX: DEFAULT_SETTINGS.camX,
  camY: DEFAULT_SETTINGS.camY,
  camSize: DEFAULT_SETTINGS.camSize,
  camShape: DEFAULT_SETTINGS.camShape,
  camMirror: DEFAULT_SETTINGS.camMirror,
  camBorderColor: DEFAULT_SETTINGS.camBorderColor,
  camBorderWidth: DEFAULT_SETTINGS.camBorderWidth,
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
  const reduce = useReducedMotion();
  // Unique per instance so the sliding pill never jumps between two selectors.
  const layoutId = useId();

  return (
    <div className="inline-flex rounded-lg border border-border bg-background/50 p-0.5">
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={String(option.value)}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "relative rounded-md px-2.5 py-1 text-sm transition-colors",
              active
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active && (
              <motion.span
                aria-hidden
                layoutId={layoutId}
                className="absolute inset-0 rounded-md bg-red/15 ring-1 ring-red/30"
                transition={
                  reduce
                    ? { duration: 0 }
                    : { type: "spring", stiffness: 500, damping: 35 }
                }
              />
            )}
            <span className="relative z-10">{option.label}</span>
          </button>
        );
      })}
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
  onDevices,
}: {
  settings: RecorderSettings;
  onChange: (patch: Partial<RecorderSettings>) => void;
  onDevices?: (devices: MediaDeviceInfo[]) => void;
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
    const constraints: MediaTrackConstraints = { width: 640, height: 480 };
    if (settings.camDeviceId) {
      constraints.deviceId = { ideal: settings.camDeviceId };
    }
    navigator.mediaDevices
      .getUserMedia({ video: constraints })
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
        // Labels are only populated once permission is granted, so list the
        // available cameras now.
        navigator.mediaDevices
          .enumerateDevices()
          .then((all) => {
            if (!cancelled) {
              onDevices?.(all.filter((d) => d.kind === "videoinput"));
            }
          })
          .catch(() => {});
      })
      .catch(() => setReady(false));
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
    // onDevices is a state setter from the dialog; stable across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.camDeviceId]);

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
            { value: "720p", label: "720p" },
            { value: "1080p", label: "1080p" },
            { value: "1440p", label: "1440p" },
            { value: "auto", label: "Auto" },
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
      <Row label="Quality">
        <Segmented
          value={settings.quality}
          onChange={(quality) => onChange({ quality })}
          options={[
            { value: "standard", label: "Standard" },
            { value: "high", label: "High" },
            { value: "max", label: "Max" },
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
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

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

        <CameraPreview
          settings={settings}
          onChange={onChange}
          onDevices={setDevices}
        />

        <div className="space-y-3.5">
          {devices.length > 1 && (
            <Row label="Camera">
              <select
                value={settings.camDeviceId ?? ""}
                onChange={(e) =>
                  onChange({ camDeviceId: e.target.value || null })
                }
                className="max-w-52 truncate rounded-lg border border-border bg-background/50 px-2.5 py-1.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-red/40"
              >
                <option value="">Default</option>
                {devices.map((device, i) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Camera ${i + 1}`}
                  </option>
                ))}
              </select>
            </Row>
          )}
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

          <div className="flex justify-end border-t border-border pt-3">
            <button
              type="button"
              onClick={() => onChange({ ...DEFAULT_CAMERA_SETTINGS })}
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Reset to defaults
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Live input-level meter for the selected microphone. */
function MicMeter({
  deviceId,
  onDevices,
}: {
  deviceId: string | null;
  onDevices?: (devices: MediaDeviceInfo[]) => void;
}) {
  const [level, setLevel] = useState(0);
  const [ready, setReady] = useState(true);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let raf = 0;
    let cancelled = false;

    const constraints: MediaTrackConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
    };
    if (deviceId) constraints.deviceId = { ideal: deviceId };

    navigator.mediaDevices
      .getUserMedia({ audio: constraints })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        setReady(true);

        const AudioCtx: typeof AudioContext =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        ctx = new AudioCtx();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        ctx.createMediaStreamSource(s).connect(analyser);
        const data = new Uint8Array(analyser.fftSize);

        const tick = () => {
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128;
            sum += v * v;
          }
          // RMS, boosted so normal speech fills most of the bar.
          setLevel(Math.min(1, Math.sqrt(sum / data.length) * 3.5));
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);

        // Labels are only populated once permission is granted.
        navigator.mediaDevices
          .enumerateDevices()
          .then((all) => {
            if (!cancelled) {
              onDevices?.(all.filter((d) => d.kind === "audioinput"));
            }
          })
          .catch(() => {});
      })
      .catch(() => setReady(false));

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      ctx?.close().catch(() => {});
    };
    // onDevices is a state setter from the dialog; stable across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId]);

  const SEGMENTS = 20;
  const lit = Math.round(level * SEGMENTS);

  return (
    <div className="space-y-2">
      <div className="flex h-9 items-center gap-1 rounded-lg border border-border bg-background/50 px-3">
        {!ready ? (
          <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <MicOff className="size-3.5" />
            Microphone unavailable — check permissions.
          </span>
        ) : (
          Array.from({ length: SEGMENTS }).map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-3 flex-1 rounded-full transition-colors duration-75",
                i < lit
                  ? i >= SEGMENTS - 4
                    ? "bg-red-hover"
                    : "bg-red"
                  : "bg-muted-foreground/15",
              )}
            />
          ))
        )}
      </div>
      {ready && (
        <p className="text-xs text-muted-foreground">
          Say something — the bar should move.
        </p>
      )}
    </div>
  );
}

/** Modal for the microphone — a live level check and device picker. */
export function MicSettingsDialog({
  settings,
  onChange,
  disabled,
}: {
  settings: RecorderSettings;
  onChange: (patch: Partial<RecorderSettings>) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        disabled={disabled}
        aria-label="Microphone settings"
        title="Microphone settings"
        className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-red/10 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
      >
        <SlidersHorizontal className="size-4" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Microphone</DialogTitle>
          <DialogDescription>
            Check your levels before you record.
          </DialogDescription>
        </DialogHeader>

        {/* Only hold the mic open while the dialog is — release it on close. */}
        {open && (
          <MicMeter deviceId={settings.micDeviceId} onDevices={setDevices} />
        )}

        {devices.length > 1 && (
          <Row label="Microphone">
            <select
              value={settings.micDeviceId ?? ""}
              onChange={(e) => onChange({ micDeviceId: e.target.value || null })}
              className="max-w-52 truncate rounded-lg border border-border bg-background/50 px-2.5 py-1.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-red/40"
            >
              <option value="">Default</option>
              {devices.map((device, i) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `Microphone ${i + 1}`}
                </option>
              ))}
            </select>
          </Row>
        )}
      </DialogContent>
    </Dialog>
  );
}
