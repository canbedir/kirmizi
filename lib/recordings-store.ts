"use client";

// Local-only history of recent recordings, kept in the browser's IndexedDB
// (never uploaded). Meta and blobs live in separate stores so listing doesn't
// pull every video into memory.

import type { CameraLayout } from "@/lib/camera-layout";

const DB_NAME = "kirmizi";
const DB_VERSION = 1;
const META = "meta";
const BLOBS = "blobs";
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

export async function saveRecording(rec: NewRecording): Promise<void> {
  if (!hasIDB()) return;
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
      const pruneTx = db.transaction([META, BLOBS], "readwrite");
      for (const m of stale) {
        pruneTx.objectStore(META).delete(m.id);
        pruneTx.objectStore(BLOBS).delete(m.id);
        pruneTx.objectStore(BLOBS).delete(camKey(m.id));
      }
      await txDone(pruneTx);
    }
    db.close();
  } catch {
    /* history is best-effort */
  }
}

export async function deleteRecording(id: string): Promise<void> {
  if (!hasIDB()) return;
  try {
    const db = await openDB();
    const tx = db.transaction([META, BLOBS], "readwrite");
    tx.objectStore(META).delete(id);
    tx.objectStore(BLOBS).delete(id);
    tx.objectStore(BLOBS).delete(camKey(id));
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
