"use client";

import { useCallback, useEffect, useState } from "react";
import {
  deleteRecording,
  listRecordings,
  saveRecording,
  type NewRecording,
  type RecordingMeta,
} from "@/lib/recordings-store";

export function useRecentRecordings() {
  const [items, setItems] = useState<RecordingMeta[]>([]);

  const refresh = useCallback(() => {
    listRecordings()
      .then(setItems)
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const save = useCallback(
    (rec: NewRecording) => {
      // Best-effort: a huge recording can blow the storage quota — the user
      // still has the in-memory recording either way.
      saveRecording(rec).then(refresh).catch(() => {});
    },
    [refresh],
  );

  const remove = useCallback(
    (id: string) => {
      deleteRecording(id).then(refresh).catch(() => {});
    },
    [refresh],
  );

  return { items, save, remove };
}
