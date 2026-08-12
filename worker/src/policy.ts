// What the share endpoint will and won't accept.
//
// Kept apart from the Worker itself so it can be reasoned about and tested
// without a network: these are the rules that decide whether a stranger gets
// to put a file in a bucket somebody pays for, and getting them wrong is the
// one failure here that costs money rather than a bug report.
//
// Cloudflare bills past the free tier rather than stopping, so nothing below
// relies on the platform to say no. The app says no first.

/** How long a shared clip lives before the sweeper takes it. */
export const TTL_SECONDS = 24 * 60 * 60;

/** The most a single clip may be. */
export const MAX_BYTES = 50 * 1024 * 1024;
export const MAX_SECONDS = 120;

/**
 * What everybody together may upload in a day.
 *
 * A clip lives for a day, so the average storage across a month is roughly
 * whatever goes up in one — which makes this number the whole cost control.
 * The free tier is 10 GB-month; 8 leaves room for the sweeper to run late.
 */
export const DAILY_BYTES = 8 * 1024 * 1024 * 1024;
/** And a count, so a flood of small files can't cost a million operations. */
export const DAILY_UPLOADS = 2000;

/** What one address may do. Generous for a person, useless to a script. */
export const IP_HOURLY_UPLOADS = 6;
export const IP_DAILY_BYTES = 400 * 1024 * 1024;

export interface Refusal {
  /** What to send back. */
  status: number;
  /** Shown to the person, so it says what to do rather than what went wrong. */
  message: string;
}

export interface Usage {
  bytes: number;
  uploads: number;
}

/** The UTC day a moment falls in, which is what usage is counted against. */
export function dayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** The hour, for the per-address limit. */
export function hourKey(now: number): string {
  return new Date(now).toISOString().slice(0, 13);
}

/** Whether the clip itself is one we'll take. */
export function checkClip(bytes: number, seconds: number): Refusal | null {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return { status: 400, message: "That clip is empty." };
  }
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return { status: 400, message: "That clip has no length." };
  }
  if (seconds > MAX_SECONDS) {
    return {
      status: 413,
      message: `Links are for clips up to ${MAX_SECONDS / 60} minutes. Cut it down, or download this one instead.`,
    };
  }
  if (bytes > MAX_BYTES) {
    return {
      status: 413,
      message: `That clip is over ${Math.round(MAX_BYTES / 1024 / 1024)} MB. Download it instead.`,
    };
  }
  return null;
}

/** Whether there's room in today's budget for it. */
export function checkBudget(used: Usage, bytes: number): Refusal | null {
  if (used.uploads >= DAILY_UPLOADS || used.bytes + bytes > DAILY_BYTES) {
    return {
      status: 503,
      // Deliberately not an error: the limit exists so this stays free, and
      // saying so is better than implying something broke.
      message:
        "Sharing has hit today's limit — it's a free service on a fixed budget. Try again tomorrow, or download the clip.",
    };
  }
  return null;
}

/** Whether this address has had its share of it. */
export function checkAddress(
  hourly: Usage,
  daily: Usage,
  bytes: number,
): Refusal | null {
  if (hourly.uploads >= IP_HOURLY_UPLOADS) {
    return { status: 429, message: "That's a lot of links in an hour. Try again shortly." };
  }
  if (daily.bytes + bytes > IP_DAILY_BYTES) {
    return { status: 429, message: "You've shared a lot today. Try again tomorrow." };
  }
  return null;
}

/** When a clip uploaded now should be swept. */
export function expiryFor(now: number): number {
  return now + TTL_SECONDS * 1000;
}

export function hasExpired(expiresAt: number, now: number): boolean {
  return expiresAt <= now;
}

/** How long is left, in whole minutes, for telling someone. */
export function minutesLeft(expiresAt: number, now: number): number {
  return Math.max(0, Math.floor((expiresAt - now) / 60000));
}

/**
 * An id nobody can guess. The link is the only thing protecting a clip, so
 * this is 80 bits of randomness rather than a counter or a timestamp.
 */
export function newId(random: Crypto = crypto): string {
  const bytes = new Uint8Array(10);
  random.getRandomValues(bytes);
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (const byte of bytes) {
    out += alphabet[byte & 31];
    out += alphabet[(byte >> 5) & 31];
  }
  return out;
}

/** A token only the uploader holds, so they can take a link down early. */
export function newToken(random: Crypto = crypto): string {
  const bytes = new Uint8Array(16);
  random.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time-ish comparison, so a token can't be probed a character at a time. */
export function tokenMatches(given: string, expected: string): boolean {
  if (typeof given !== "string" || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}
