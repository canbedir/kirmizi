"use client";

// Local-only history of recent recordings, kept in the browser's IndexedDB
// (never uploaded). Meta and blobs live in separate stores so listing doesn't
// pull every video into memory.

import type { CameraLayout } from "@/lib/camera-layout";
import type { CursorMiss, CursorTrack } from "@/lib/cursor-track";

const DB_NAME = "kirmizi";
const DB_VERSION = 2;
const META = "meta";
const BLOBS = "blobs";
/** Edit state, keyed by recording id — see lib/edit-state.ts. */
const EDITS = "edits";
const MAX_ITEMS = 5;

// The webcam track (when present) lives in BLOBS under a derived key.
const camKey = (id: string) => `${id}/cam`;

export interface RecordingMeta {
  id: string;
  mimeType: string;
  size: number;
  durationMs: number;
  createdAt: number;
  /** JPEG data URL of a cover frame, if one could be captured. */
  cover?: string | null;
  /** Set when a webcam track was stored alongside the screen recording. */
  cameraMimeType?: string | null;
  cameraLayout?: CameraLayout | null;
  /** Pointer data from the companion extension, if there was any. */
  cursor?: CursorTrack | null;
  /** And why there wasn't, so a reopened recording can still say so. */
  cursorMiss?: CursorMiss | null;
}

export interface NewRecording {
  blob: Blob;
  mimeType: string;
  size: number;
  durationMs: number;
  cover?: string | null;
  camera?: {
    blob: Blob;
    mimeType: string;
    layout: CameraLayout;
  } | null;
  cursor?: CursorTrack | null;
  cursorMiss?: CursorMiss | null;
}

function hasIDB(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(META)) {
        db.createObjectStore(META, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(BLOBS)) {
        db.createObjectStore(BLOBS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(EDITS)) {
        db.createObjectStore(EDITS, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Attach pointer data to a take already filed, rather than filing it twice.
 *
 * The companion answers after the recording is finished, so what the editor
 * knows about the pointer arrives a moment behind everything else. The take
 * is already in here by then, and re-saving it would put a second copy of
 * the same recording in a history five items long.
 */
export async function updateRecordingCursor(
  id: string,
  cursor: CursorTrack | null,
  cursorMiss: CursorMiss | null,
): Promise<void> {
  if (!hasIDB()) return;
  try {
    const db = await openDB();
    const tx = db.transaction(META, "readwrite");
    const store = tx.objectStore(META);
    const meta = (await request(store.get(id))) as RecordingMeta | undefined;
    // Gone already — pruned, or deleted while the companion was answering.
    if (meta) store.put({ ...meta, cursor, cursorMiss });
    await txDone(tx);
    db.close();
  } catch {
    // Best-effort, exactly like saving it was.
  }
}

export async function listRecordings(): Promise<RecordingMeta[]> {
  if (!hasIDB()) return [];
  try {
    const db = await openDB();
    const store = db.transaction(META, "readonly").objectStore(META);
    const all = (await request(store.getAll())) as RecordingMeta[];
    db.close();
    return all.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export async function getRecordingBlob(id: string): Promise<Blob | null> {
  if (!hasIDB()) return null;
  try {
    const db = await openDB();
    const store = db.transaction(BLOBS, "readonly").objectStore(BLOBS);
    const rec = (await request(store.get(id))) as
      | { id: string; blob: Blob }
      | undefined;
    db.close();
    return rec?.blob ?? null;
  } catch {
    return null;
  }
}

/** Saves a recording and returns the id it was filed under, if it was. */
export async function saveRecording(
  rec: NewRecording,
): Promise<string | null> {
  if (!hasIDB()) return null;
  try {
    const db = await openDB();
    const id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : String(Date.now()) + Math.random().toString(36).slice(2);
    const meta: RecordingMeta = {
      id,
      mimeType: rec.mimeType,
      size: rec.size,
      durationMs: rec.durationMs,
      createdAt: Date.now(),
      cover: rec.cover ?? null,
      cameraMimeType: rec.camera?.mimeType ?? null,
      cameraLayout: rec.camera?.layout ?? null,
      cursor: rec.cursor ?? null,
      cursorMiss: rec.cursorMiss ?? null,
    };
    const tx = db.transaction([META, BLOBS], "readwrite");
    tx.objectStore(META).put(meta);
    tx.objectStore(BLOBS).put({ id, blob: rec.blob });
    if (rec.camera) {
      tx.objectStore(BLOBS).put({ id: camKey(id), blob: rec.camera.blob });
    }
    await txDone(tx);

    // Keep only the newest MAX_ITEMS.
    const metaStore = db.transaction(META, "readonly").objectStore(META);
    const all = (await request(metaStore.getAll())) as RecordingMeta[];
    all.sort((a, b) => b.createdAt - a.createdAt);
    const stale = all.slice(MAX_ITEMS);
    if (stale.length) {
      const pruneTx = db.transaction([META, BLOBS, EDITS], "readwrite");
      for (const m of stale) {
        pruneTx.objectStore(META).delete(m.id);
        pruneTx.objectStore(BLOBS).delete(m.id);
        pruneTx.objectStore(BLOBS).delete(camKey(m.id));
        pruneTx.objectStore(EDITS).delete(m.id);
      }
      await txDone(pruneTx);
    }
    db.close();
    return id;
  } catch {
    /* history is best-effort */
    return null;
  }
}

/* ---------------------------------------------------------------- */
/* Edits                                                             */
/* ---------------------------------------------------------------- */

/** Store the edit state for a recording, replacing whatever was there. */
export async function saveEdits(id: string, edits: unknown): Promise<void> {
  if (!hasIDB() || !id) return;
  try {
    const db = await openDB();
    const tx = db.transaction(EDITS, "readwrite");
    tx.objectStore(EDITS).put({ id, edits });
    await txDone(tx);
    db.close();
  } catch {
    /* an unsaved edit is a smaller loss than a broken editor */
  }
}

/** The stored edit state for a recording, if it has any. */
export async function getEdits(id: string): Promise<unknown | null> {
  if (!hasIDB() || !id) return null;
  try {
    const db = await openDB();
    const store = db.transaction(EDITS, "readonly").objectStore(EDITS);
    const row = (await request(store.get(id))) as
      | { id: string; edits: unknown }
      | undefined;
    db.close();
    return row?.edits ?? null;
  } catch {
    return null;
  }
}

export async function deleteRecording(id: string): Promise<void> {
  if (!hasIDB()) return;
  try {
    const db = await openDB();
    const tx = db.transaction([META, BLOBS, EDITS], "readwrite");
    tx.objectStore(META).delete(id);
    tx.objectStore(BLOBS).delete(id);
    tx.objectStore(BLOBS).delete(camKey(id));
    tx.objectStore(EDITS).delete(id);
    await txDone(tx);
    db.close();
  } catch {
    /* ignore */
  }
}

/** The stored webcam track for a recording, if one was saved. */
export async function getRecordingCameraBlob(id: string): Promise<Blob | null> {
  if (!hasIDB()) return null;
  try {
    const db = await openDB();
    const store = db.transaction(BLOBS, "readonly").objectStore(BLOBS);
    const rec = (await request(store.get(camKey(id)))) as
      | { id: string; blob: Blob }
      | undefined;
    db.close();
    return rec?.blob ?? null;
  } catch {
    return null;
  }
}
