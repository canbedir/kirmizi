"use client";

import { useCallback, useMemo, useState } from "react";
import {
  ZOOM_DEFAULT_LENGTH,
  ZOOM_DEFAULT_SCALE,
  ZOOM_MAX_SCALE,
  ZOOM_MIN_LENGTH,
  type ZoomRegion,
} from "@/lib/scene";

export interface Segment {
  id: string;
  /** Source in-point, seconds. */
  start: number;
  /** Source out-point, seconds. */
  end: number;
  muted: boolean;
  /** Playback rate for this segment (0.5–2). */
  speed: number;
}

export const SPEED_STEPS = [0.5, 1, 1.5, 2] as const;

function uid(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

const EPS = 0.05;

/** Shortest a segment can be trimmed down to, seconds. */
export const SEGMENT_MIN_LENGTH = 0.2;

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

// One undoable edit state: the kept segments plus the zoom regions. Both
// travel through the same history so Ctrl+Z walks every timeline edit.
interface EditState {
  segments: Segment[];
  zooms: ZoomRegion[];
}

interface History {
  past: EditState[];
  present: EditState;
  future: EditState[];
}

const EMPTY: History = {
  past: [],
  present: { segments: [], zooms: [] },
  future: [],
};

export interface VideoEditor {
  duration: number;
  segments: Segment[];
  zooms: ZoomRegion[];
  selectedId: string | null;
  selectedZoomId: string | null;
  /** Kept span after edits, in seconds (accounting for per-segment speed). */
  editedDuration: number;
  /** True once the user has cut, muted, or changed speed anywhere. */
  isEdited: boolean;
  canUndo: boolean;
  canRedo: boolean;
  init: (duration: number) => void;
  select: (id: string | null) => void;
  selectZoom: (id: string | null) => void;
  /** Split the segment under `time` into two at `time`. */
  split: (time: number) => void;
  /** Remove a segment (no-op if it's the last remaining one). */
  remove: (id: string) => void;
  setMuted: (id: string, muted: boolean) => void;
  setSpeed: (id: string, speed: number) => void;
  /**
   * Trim a segment's in/out point without touching the undo history — call
   * `checkpoint()` once at the start of the drag so the whole gesture undoes
   * as one step. Edges are clamped against the clip bounds, neighbouring
   * segments, and a minimum length; a trimmed-away range can be recovered by
   * dragging back out into the gap.
   */
  updateSegment: (
    id: string,
    patch: Partial<Pick<Segment, "start" | "end">>,
  ) => void;
  /**
   * Add a zoom region at `time` and select it. Returns the new region, an
   * existing region already covering `time`, or null if there's no room.
   * Undoable.
   */
  addZoom: (time: number) => ZoomRegion | null;
  removeZoom: (id: string) => void;
  /**
   * Patch a zoom region without touching the undo history — call
   * `checkpoint()` once at the start of a drag/slider gesture so the whole
   * gesture undoes as one step. Values are clamped against the clip bounds
   * and neighbouring regions.
   */
  updateZoom: (
    id: string,
    patch: Partial<Omit<ZoomRegion, "id">>,
  ) => void;
  /** Snapshot the current state into the undo history. */
  checkpoint: () => void;
  undo: () => void;
  redo: () => void;
  /** The kept segment containing `time`, or the next one after a gap. */
  segmentAt: (time: number) => Segment | null;
}

export function useVideoEditor(): VideoEditor {
  const [duration, setDuration] = useState(0);
  const [history, setHistory] = useState<History>(EMPTY);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedZoomId, setSelectedZoomId] = useState<string | null>(null);

  const { segments, zooms } = history.present;

  const init = useCallback((value: number) => {
    setDuration(value);
    setHistory({
      past: [],
      present: {
        segments: [{ id: uid(), start: 0, end: value, muted: false, speed: 1 }],
        zooms: [],
      },
      future: [],
    });
    setSelectedId(null);
    setSelectedZoomId(null);
  }, []);

  // Apply a change to the present state, recording it in the undo history.
  const apply = useCallback((fn: (state: EditState) => EditState) => {
    setHistory((h) => {
      const next = fn(h.present);
      if (next === h.present) return h;
      return { past: [...h.past, h.present], present: next, future: [] };
    });
  }, []);

  const select = useCallback((id: string | null) => {
    setSelectedId(id);
    if (id) setSelectedZoomId(null);
  }, []);

  const selectZoom = useCallback((id: string | null) => {
    setSelectedZoomId(id);
    if (id) setSelectedId(null);
  }, []);

  const split = useCallback(
    (time: number) => {
      apply((prev) => {
        const target = prev.segments.find(
          (s) => time > s.start + EPS && time < s.end - EPS,
        );
        if (!target) return prev;
        const left: Segment = { ...target, id: uid(), end: time };
        const right: Segment = { ...target, id: uid(), start: time };
        return {
          ...prev,
          segments: prev.segments
            .flatMap((s) => (s.id === target.id ? [left, right] : [s]))
            .sort((a, b) => a.start - b.start),
        };
      });
    },
    [apply],
  );

  const remove = useCallback(
    (id: string) => {
      apply((prev) =>
        prev.segments.length <= 1
          ? prev
          : { ...prev, segments: prev.segments.filter((s) => s.id !== id) },
      );
      setSelectedId((cur) => (cur === id ? null : cur));
    },
    [apply],
  );

  const setMuted = useCallback(
    (id: string, muted: boolean) => {
      apply((prev) => ({
        ...prev,
        segments: prev.segments.map((s) => (s.id === id ? { ...s, muted } : s)),
      }));
    },
    [apply],
  );

  const setSpeed = useCallback(
    (id: string, speed: number) => {
      apply((prev) => ({
        ...prev,
        segments: prev.segments.map((s) => (s.id === id ? { ...s, speed } : s)),
      }));
    },
    [apply],
  );

  const updateSegment = useCallback(
    (id: string, patch: Partial<Pick<Segment, "start" | "end">>) => {
      setHistory((h) => {
        const cur = h.present.segments.find((s) => s.id === id);
        if (!cur) return h;
        const others = h.present.segments.filter((s) => s.id !== id);
        // Trimming can reach into deleted gaps but never past a neighbour.
        let lo = 0;
        let hi = duration;
        for (const s of others) {
          if (s.end <= cur.start + EPS) lo = Math.max(lo, s.end);
          if (s.start >= cur.end - EPS) hi = Math.min(hi, s.start);
        }
        const next: Segment = { ...cur, ...patch };
        if (patch.start !== undefined) {
          next.start = clamp(next.start, lo, cur.end - SEGMENT_MIN_LENGTH);
        }
        if (patch.end !== undefined) {
          next.end = clamp(next.end, cur.start + SEGMENT_MIN_LENGTH, hi);
        }
        return {
          ...h,
          present: {
            ...h.present,
            segments: others
              .concat(next)
              .sort((a, b) => a.start - b.start),
          },
        };
      });
    },
    [duration],
  );

  // The free window around `time` between neighbouring zoom regions.
  const freeWindow = useCallback(
    (regions: ZoomRegion[], time: number): { lo: number; hi: number } => {
      let lo = 0;
      let hi = duration;
      for (const z of regions) {
        if (z.end <= time + EPS) lo = Math.max(lo, z.end);
        if (z.start >= time - EPS) hi = Math.min(hi, z.start);
      }
      return { lo, hi };
    },
    [duration],
  );

  const addZoom = useCallback(
    (time: number): ZoomRegion | null => {
      const existing = zooms.find((z) => time >= z.start && time <= z.end);
      if (existing) {
        selectZoom(existing.id);
        return existing;
      }
      const { lo, hi } = freeWindow(zooms, time);
      if (hi - lo < ZOOM_MIN_LENGTH) return null;
      const start = clamp(time, lo, hi - ZOOM_MIN_LENGTH);
      const end = Math.min(start + ZOOM_DEFAULT_LENGTH, hi);
      const region: ZoomRegion = {
        id: uid(),
        start,
        end,
        x: 0.5,
        y: 0.5,
        scale: ZOOM_DEFAULT_SCALE,
      };
      apply((prev) => ({
        ...prev,
        zooms: [...prev.zooms, region].sort((a, b) => a.start - b.start),
      }));
      selectZoom(region.id);
      return region;
    },
    [apply, freeWindow, selectZoom, zooms],
  );

  const removeZoom = useCallback(
    (id: string) => {
      apply((prev) => ({
        ...prev,
        zooms: prev.zooms.filter((z) => z.id !== id),
      }));
      setSelectedZoomId((cur) => (cur === id ? null : cur));
    },
    [apply],
  );

  const updateZoom = useCallback(
    (id: string, patch: Partial<Omit<ZoomRegion, "id">>) => {
      setHistory((h) => {
        const cur = h.present.zooms.find((z) => z.id === id);
        if (!cur) return h;
        const others = h.present.zooms.filter((z) => z.id !== id);
        let lo = 0;
        let hi = duration;
        for (const z of others) {
          if (z.end <= cur.start + EPS) lo = Math.max(lo, z.end);
          if (z.start >= cur.end - EPS) hi = Math.min(hi, z.start);
        }
        const next: ZoomRegion = { ...cur, ...patch };
        if (patch.start !== undefined && patch.end !== undefined) {
          // Move: preserve the region's length inside the free window.
          const len = Math.min(next.end - next.start, hi - lo);
          next.start = clamp(next.start, lo, hi - len);
          next.end = next.start + len;
        } else if (patch.start !== undefined) {
          next.start = clamp(next.start, lo, cur.end - ZOOM_MIN_LENGTH);
        } else if (patch.end !== undefined) {
          next.end = clamp(next.end, cur.start + ZOOM_MIN_LENGTH, hi);
        }
        next.x = clamp(next.x, 0, 1);
        next.y = clamp(next.y, 0, 1);
        next.scale = clamp(next.scale, 1.1, ZOOM_MAX_SCALE);
        return {
          ...h,
          present: {
            ...h.present,
            zooms: others
              .concat(next)
              .sort((a, b) => a.start - b.start),
          },
        };
      });
    },
    [duration],
  );

  const checkpoint = useCallback(() => {
    setHistory((h) => ({
      past: [...h.past, h.present],
      present: h.present,
      future: [],
    }));
  }, []);

  const undo = useCallback(() => {
    setHistory((h) => {
      if (!h.past.length) return h;
      const previous = h.past[h.past.length - 1];
      return {
        past: h.past.slice(0, -1),
        present: previous,
        future: [h.present, ...h.future],
      };
    });
  }, []);

  const redo = useCallback(() => {
    setHistory((h) => {
      if (!h.future.length) return h;
      const [next, ...rest] = h.future;
      return { past: [...h.past, h.present], present: next, future: rest };
    });
  }, []);

  const segmentAt = useCallback(
    (time: number): Segment | null => {
      const inside = segments.find((s) => time >= s.start - EPS && time < s.end);
      if (inside) return inside;
      return segments.find((s) => s.start >= time) ?? null;
    },
    [segments],
  );

  const editedDuration = useMemo(
    () => segments.reduce((sum, s) => sum + (s.end - s.start) / s.speed, 0),
    [segments],
  );

  const isEdited = useMemo(() => {
    if (segments.length !== 1) return true;
    const only = segments[0];
    if (!only) return false;
    return (
      only.start > EPS ||
      only.end < duration - EPS ||
      only.muted ||
      only.speed !== 1
    );
  }, [segments, duration]);

  return {
    duration,
    segments,
    zooms,
    selectedId,
    selectedZoomId,
    editedDuration,
    isEdited,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    init,
    select,
    selectZoom,
    split,
    remove,
    setMuted,
    setSpeed,
    updateSegment,
    addZoom,
    removeZoom,
    updateZoom,
    checkpoint,
    undo,
    redo,
    segmentAt,
  };
}
