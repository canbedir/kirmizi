"use client";

import { useCallback, useMemo, useState } from "react";

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

interface History {
  past: Segment[][];
  present: Segment[];
  future: Segment[][];
}

const EMPTY: History = { past: [], present: [], future: [] };

export interface VideoEditor {
  duration: number;
  segments: Segment[];
  selectedId: string | null;
  /** Kept span after edits, in seconds (accounting for per-segment speed). */
  editedDuration: number;
  /** True once the user has cut, muted, or changed speed anywhere. */
  isEdited: boolean;
  canUndo: boolean;
  canRedo: boolean;
  init: (duration: number) => void;
  select: (id: string | null) => void;
  /** Split the segment under `time` into two at `time`. */
  split: (time: number) => void;
  /** Remove a segment (no-op if it's the last remaining one). */
  remove: (id: string) => void;
  setMuted: (id: string, muted: boolean) => void;
  setSpeed: (id: string, speed: number) => void;
  undo: () => void;
  redo: () => void;
  /** The kept segment containing `time`, or the next one after a gap. */
  segmentAt: (time: number) => Segment | null;
}

export function useVideoEditor(): VideoEditor {
  const [duration, setDuration] = useState(0);
  const [history, setHistory] = useState<History>(EMPTY);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const segments = history.present;

  const init = useCallback((value: number) => {
    setDuration(value);
    setHistory({
      past: [],
      present: [{ id: uid(), start: 0, end: value, muted: false, speed: 1 }],
      future: [],
    });
    setSelectedId(null);
  }, []);

  // Apply a change to the present segments, recording it in the undo history.
  const apply = useCallback((fn: (segs: Segment[]) => Segment[]) => {
    setHistory((h) => {
      const next = fn(h.present);
      if (next === h.present) return h;
      return { past: [...h.past, h.present], present: next, future: [] };
    });
  }, []);

  const select = useCallback((id: string | null) => setSelectedId(id), []);

  const split = useCallback(
    (time: number) => {
      apply((prev) => {
        const target = prev.find(
          (s) => time > s.start + EPS && time < s.end - EPS,
        );
        if (!target) return prev;
        const left: Segment = { ...target, id: uid(), end: time };
        const right: Segment = { ...target, id: uid(), start: time };
        return prev
          .flatMap((s) => (s.id === target.id ? [left, right] : [s]))
          .sort((a, b) => a.start - b.start);
      });
    },
    [apply],
  );

  const remove = useCallback(
    (id: string) => {
      apply((prev) => (prev.length <= 1 ? prev : prev.filter((s) => s.id !== id)));
      setSelectedId((cur) => (cur === id ? null : cur));
    },
    [apply],
  );

  const setMuted = useCallback(
    (id: string, muted: boolean) => {
      apply((prev) => prev.map((s) => (s.id === id ? { ...s, muted } : s)));
    },
    [apply],
  );

  const setSpeed = useCallback(
    (id: string, speed: number) => {
      apply((prev) => prev.map((s) => (s.id === id ? { ...s, speed } : s)));
    },
    [apply],
  );

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
    selectedId,
    editedDuration,
    isEdited,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    init,
    select,
    split,
    remove,
    setMuted,
    setSpeed,
    undo,
    redo,
    segmentAt,
  };
}
