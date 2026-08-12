"use client";

// Putting a clip somewhere it can be linked to.
//
// This is the one thing in kirmizi that leaves the machine, so it only ever
// happens because somebody asked for it, and it says plainly what it did. The
// upload goes straight to the Worker in front of R2 — the app's own server
// never sees a frame, and there is no endpoint on it that could.

import { SHARE_MAX_SECONDS } from "@/lib/export-profile";
import { siteConfig } from "@/lib/site";

export interface Share {
  id: string;
  /** Held only here, so this browser can take the link down again. */
  deleteToken: string;
  /** Unix ms. */
  expiresAt: number;
}

/** Where a share's page lives. */
export function shareUrl(id: string): string {
  return `${siteConfig.url}/v/${id}`;
}

/** Where its bytes live. */
export function shareFileUrl(id: string): string {
  return `${siteConfig.shareApi}/f/${id}`;
}

export function canShare(): boolean {
  return !!siteConfig.shareApi;
}

/**
 * What the endpoint said, or something worth showing a person.
 *
 * The Worker's refusals are already written for a reader — a budget that has
 * run out is not an error and doesn't get an error's wording — so its message
 * is passed through rather than replaced.
 */
async function reasonFrom(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  if (body?.error) return body.error;
  if (response.status === 429) return "Too many links from here just now. Try again shortly.";
  if (response.status >= 500) return "The link service isn't answering. Try again in a minute.";
  return "Couldn't create a link for that clip.";
}

export interface ShareInput {
  blob: Blob;
  /** Length of the finished clip. */
  seconds: number;
  width: number;
  height: number;
  /** Cloudflare Turnstile's proof that there's a person here. */
  token: string;
  signal?: AbortSignal;
}

export async function createShare(input: ShareInput): Promise<Share> {
  if (!siteConfig.shareApi) throw new Error("Links aren't set up on this build.");
  if (input.seconds > SHARE_MAX_SECONDS) {
    // Checked here as well as on the endpoint: no reason to send fifty
    // megabytes across the network to be told no at the other end.
    throw new Error(
      `Links are for clips up to ${SHARE_MAX_SECONDS / 60} minutes. Cut it down, or download this one instead.`,
    );
  }

  const query = new URLSearchParams({
    seconds: String(Math.round(input.seconds * 100) / 100),
    w: String(input.width),
    h: String(input.height),
    token: input.token,
  });

  const response = await fetch(`${siteConfig.shareApi}/share?${query}`, {
    method: "POST",
    headers: { "content-type": "video/mp4" },
    body: input.blob,
    signal: input.signal,
  });
  if (!response.ok) throw new Error(await reasonFrom(response));

  const share = (await response.json()) as Share;
  if (!share?.id) throw new Error("The link service answered with nothing.");
  return share;
}

/** Take a link down before its day is up. */
export async function deleteShare(id: string, deleteToken: string): Promise<boolean> {
  if (!siteConfig.shareApi) return false;
  const response = await fetch(`${siteConfig.shareApi}/d/${id}`, {
    method: "DELETE",
    headers: { "x-delete-token": deleteToken },
  }).catch(() => null);
  return !!response?.ok;
}

export interface ShareInfo {
  id: string;
  bytes: number;
  seconds: number;
  width: number;
  height: number;
  createdAt: number;
  expiresAt: number;
}

/** What a link points at, or null if its day is up. */
export async function readShare(id: string): Promise<ShareInfo | null> {
  if (!siteConfig.shareApi) return null;
  const response = await fetch(`${siteConfig.shareApi}/i/${id}`, {
    // The page is rendered fresh: a link that has just expired should say so.
    cache: "no-store",
  }).catch(() => null);
  if (!response?.ok) return null;
  return (await response.json().catch(() => null)) as ShareInfo | null;
}

/* ---------------------------------------------------------------- */
/* Links this browser made                                           */
/* ---------------------------------------------------------------- */

const KEPT = "kirmizi:shares";
/** More than anyone needs to reach back through, and small in storage. */
const KEEP = 20;

export interface KeptShare extends Share {
  madeAt: number;
}

/**
 * The links made from this browser, with the tokens that can delete them.
 *
 * There are no accounts, so this is the only record that a link belongs to
 * you — which means it lives here and nowhere else, and clearing site data
 * gives up the ability to take a link down early.
 */
export function keptShares(): KeptShare[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(localStorage.getItem(KEPT) ?? "[]");
    if (!Array.isArray(raw)) return [];
    const now = Date.now();
    return raw.filter(
      (s): s is KeptShare =>
        !!s &&
        typeof s.id === "string" &&
        typeof s.deleteToken === "string" &&
        typeof s.expiresAt === "number" &&
        s.expiresAt > now,
    );
  } catch {
    return [];
  }
}

export function keepShare(share: Share): void {
  if (typeof window === "undefined") return;
  const next = [{ ...share, madeAt: Date.now() }, ...keptShares()].slice(0, KEEP);
  try {
    localStorage.setItem(KEPT, JSON.stringify(next));
  } catch {
    /* remembering the token is a convenience, not the feature */
  }
}

export function forgetShare(id: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      KEPT,
      JSON.stringify(keptShares().filter((s) => s.id !== id)),
    );
  } catch {
    /* nothing to do about it */
  }
}
