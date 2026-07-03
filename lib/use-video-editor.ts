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

export interface VideoEditor {
  duration: number;
  segments: Segment[];
  selectedId: string | null;
  /** Kept span after edits, in seconds (accounting for per-segment speed). */
  editedDuration: number;
  /** True once the user has cut, muted, or changed speed anywhere. */
  isEdited: boolean;
  init: (duration: number) => void;
  select: (id: string | null) => void;
  /** Split the segment under `time` into two at `time`. */
  split: (time: number) => void;
  /** Remove a segment (no-op if it's the last remaining one). */
  remove: (id: string) => void;
  setMuted: (id: string, muted: boolean) => void;
  setSpeed: (id: string, speed: number) => void;
  /** The kept segment containing `time`, or the next one after a gap. */
  segmentAt: (time: number) => Segment | null;
}

export function useVideoEditor(): VideoEditor {
  const [duration, setDuration] = useState(0);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const init = useCallback((value: number) => {
    setDuration(value);
    setSegments([
      { id: uid(), start: 0, end: value, muted: false, speed: 1 },
    ]);
    setSelectedId(null);
  }, []);

  const select = useCallback((id: string | null) => setSelectedId(id), []);

  const split = useCallback((time: number) => {
    setSegments((prev) => {
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
  }, []);

  const remove = useCallback((id: string) => {
    setSegments((prev) => (prev.length <= 1 ? prev : prev.filter((s) => s.id !== id)));
    setSelectedId((cur) => (cur === id ? null : cur));
  }, []);

  const setMuted = useCallback((id: string, muted: boolean) => {
    setSegments((prev) => prev.map((s) => (s.id === id ? { ...s, muted } : s)));
  }, []);

  const setSpeed = useCallback((id: string, speed: number) => {
    setSegments((prev) => prev.map((s) => (s.id === id ? { ...s, speed } : s)));
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
    init,
    select,
    split,
    remove,
    setMuted,
    setSpeed,
    segmentAt,
  };
}
