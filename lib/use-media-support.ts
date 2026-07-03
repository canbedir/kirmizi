"use client";

import { useSyncExternalStore } from "react";

export interface MediaSupport {
  /** Detection has run on the client (false during SSR / first paint). */
  checked: boolean;
  /** HTTPS or localhost — getDisplayMedia requires a secure context. */
  secureContext: boolean;
  hasDisplayMedia: boolean;
  hasMediaRecorder: boolean;
  /** Everything the recorder needs is present. */
  supported: boolean;
}

const SERVER_SNAPSHOT: MediaSupport = {
  checked: false,
  secureContext: false,
  hasDisplayMedia: false,
  hasMediaRecorder: false,
  supported: false,
};

// Cache the client snapshot so useSyncExternalStore gets a stable reference.
let clientSnapshot: MediaSupport | null = null;

function detect(): MediaSupport {
  const secureContext = window.isSecureContext;
  const hasDisplayMedia =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getDisplayMedia;
  const hasMediaRecorder = typeof MediaRecorder !== "undefined";
  return {
    checked: true,
    secureContext,
    hasDisplayMedia,
    hasMediaRecorder,
    supported: secureContext && hasDisplayMedia && hasMediaRecorder,
  };
}

function getSnapshot(): MediaSupport {
  clientSnapshot ??= detect();
  return clientSnapshot;
}

function subscribe(): () => void {
  // Support never changes over a session; nothing to subscribe to.
  return () => {};
}

/** Feature-detects the screen-recording APIs, SSR-safe. */
export function useMediaSupport(): MediaSupport {
  return useSyncExternalStore(subscribe, getSnapshot, () => SERVER_SNAPSHOT);
}
