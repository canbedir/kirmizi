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
      saveRecording(rec).then(refresh);
    },
    [refresh],
  );

  const remove = useCallback(
    (id: string) => {
      deleteRecording(id).then(refresh);
    },
    [refresh],
  );

  return { items, save, remove };
}
