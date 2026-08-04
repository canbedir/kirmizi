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
    // Resolves with the id it was filed under, which is what edits are keyed
    // on, or null if it couldn't be stored.
    async (rec: NewRecording): Promise<string | null> => {
      // Best-effort: a huge recording can blow the storage quota — the user
      // still has the in-memory recording either way.
      try {
        const id = await saveRecording(rec);
        refresh();
        return id;
      } catch {
        return null;
      }
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
