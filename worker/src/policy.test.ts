import { describe, expect, test } from "bun:test";
import {
  DAILY_BYTES,
  DAILY_UPLOADS,
  IP_DAILY_BYTES,
  IP_HOURLY_UPLOADS,
  MAX_BYTES,
  MAX_SECONDS,
  TTL_SECONDS,
  VIEW_WINDOW_MS,
  checkAddress,
  checkBudget,
  checkClip,
  dayKey,
  expiryFor,
  hasExpired,
  hourKey,
  minutesLeft,
  newId,
  newToken,
  tokenMatches,
} from "./policy";

const MB = 1024 * 1024;
const NONE = { bytes: 0, uploads: 0 };

describe("checkClip", () => {
  test("takes a clip inside both limits", () => {
    expect(checkClip(10 * MB, 60)).toBeNull();
    expect(checkClip(MAX_BYTES, MAX_SECONDS)).toBeNull();
  });

  test("turns down one that's too long, and says what to do instead", () => {
    const no = checkClip(1 * MB, MAX_SECONDS + 1);
    expect(no?.status).toBe(413);
    expect(no?.message).toMatch(/2 minutes/);
    expect(no?.message).toMatch(/download/i);
  });

  test("turns down one that's too large", () => {
    expect(checkClip(MAX_BYTES + 1, 10)?.status).toBe(413);
  });

  test("and anything that isn't a clip at all", () => {
    for (const bytes of [0, -1, NaN, Infinity]) {
      expect(checkClip(bytes, 10)?.status).toBe(400);
    }
    for (const seconds of [0, -1, NaN, Infinity]) {
      expect(checkClip(MB, seconds)?.status).toBe(400);
    }
  });
});

describe("checkBudget", () => {
  test("lets an upload through while there's room", () => {
    expect(checkBudget(NONE, 40 * MB)).toBeNull();
    expect(checkBudget({ bytes: DAILY_BYTES - 100 * MB, uploads: 10 }, 40 * MB)).toBeNull();
  });

  test("stops the one that would cross the line, not the one after it", () => {
    // Cloudflare bills past the free tier instead of stopping, so this has to
    // refuse before the bytes land rather than notice afterwards.
    const nearly = { bytes: DAILY_BYTES - 10 * MB, uploads: 5 };
    expect(checkBudget(nearly, 9 * MB)).toBeNull();
    expect(checkBudget(nearly, 11 * MB)?.status).toBe(503);
  });

  test("counts uploads as well as bytes", () => {
    expect(checkBudget({ bytes: 0, uploads: DAILY_UPLOADS }, 1)?.status).toBe(503);
  });

  test("says it's a budget, not a fault", () => {
    const no = checkBudget({ bytes: DAILY_BYTES, uploads: 0 }, 1);
    expect(no?.message).toMatch(/free/i);
    expect(no?.message).not.toMatch(/error|failed|wrong/i);
  });
});

describe("checkAddress", () => {
  test("lets a person share a few clips", () => {
    expect(checkAddress(NONE, NONE, 30 * MB)).toBeNull();
    expect(
      checkAddress({ bytes: 0, uploads: IP_HOURLY_UPLOADS - 1 }, NONE, 10 * MB),
    ).toBeNull();
  });

  test("stops a script at the hourly count", () => {
    const no = checkAddress({ bytes: 0, uploads: IP_HOURLY_UPLOADS }, NONE, 1);
    expect(no?.status).toBe(429);
  });

  test("and at the daily weight, however few files it took", () => {
    const no = checkAddress(NONE, { bytes: IP_DAILY_BYTES, uploads: 1 }, 1);
    expect(no?.status).toBe(429);
  });
});

describe("expiry", () => {
  test("a clip uploaded now goes a day from now", () => {
    const now = Date.UTC(2026, 7, 11, 12, 0, 0);
    expect(expiryFor(now)).toBe(now + TTL_SECONDS * 1000);
  });

  test("expired means expired, at the moment it lands", () => {
    const now = 1_000_000;
    expect(hasExpired(now + 1, now)).toBe(false);
    expect(hasExpired(now, now)).toBe(true);
    expect(hasExpired(now - 1, now)).toBe(true);
  });

  test("how long is left, rounded down so it's never a promise", () => {
    const now = 0;
    expect(minutesLeft(90_000, now)).toBe(1);
    expect(minutesLeft(59_000, now)).toBe(0);
    expect(minutesLeft(-5, now)).toBe(0);
  });
});

describe("usage keys", () => {
  test("a day is a UTC day, wherever the request came from", () => {
    expect(dayKey(Date.UTC(2026, 7, 11, 23, 59))).toBe("2026-08-11");
    expect(dayKey(Date.UTC(2026, 7, 12, 0, 1))).toBe("2026-08-12");
  });

  test("an hour is a UTC hour", () => {
    expect(hourKey(Date.UTC(2026, 7, 11, 23, 59))).toBe("2026-08-11T23");
    expect(hourKey(Date.UTC(2026, 7, 12, 0, 1))).toBe("2026-08-12T00");
  });

  test("a view marker outlives the hour it was written in", () => {
    // The window that matters is the hour inside the key; the marker only has
    // to survive it, or the sweeper could clear it mid-hour and let the same
    // person be counted twice. Worst case is a marker written on the hour.
    const onTheHour = Date.UTC(2026, 7, 12, 10, 0, 0);
    const nextHourStarts = Date.UTC(2026, 7, 12, 11, 0, 0);
    expect(onTheHour + VIEW_WINDOW_MS).toBeGreaterThan(nextHourStarts);
  });
});

describe("ids and tokens", () => {
  test("an id is long, unguessable, and safe in a URL", () => {
    // Checked over many draws, not one: any single character appears in a
    // twenty-character id about half the time, so a single id passing this
    // proves nothing. The first version of this test was a coin flip.
    for (let i = 0; i < 500; i++) {
      const id = newId();
      expect(id).toMatch(/^[a-z0-9]{20}$/);
      // No l, o, 0 or 1 — a link gets read aloud and typed by hand, and those
      // are the four that get typed as each other. With l and 1 gone, i is
      // unambiguous and stays in.
      expect(id).not.toMatch(/[lo01]/);
    }
  });

  test("ten thousand ids, no two the same", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10_000; i++) seen.add(newId());
    expect(seen.size).toBe(10_000);
  });

  test("a delete token is its own secret", () => {
    const token = newToken();
    expect(token).toMatch(/^[0-9a-f]{32}$/);
    expect(newToken()).not.toBe(token);
  });

  test("a token is compared whole, not character by character", () => {
    const token = newToken();
    expect(tokenMatches(token, token)).toBe(true);
    expect(tokenMatches(token.slice(0, -1) + "0", token)).toBe(false);
    expect(tokenMatches(token.slice(0, 5), token)).toBe(false);
    expect(tokenMatches("", token)).toBe(false);
    expect(tokenMatches(undefined as unknown as string, token)).toBe(false);
  });
});

describe("the budget holds the free tier", () => {
  test("a day of uploads at the cap stays inside 10 GB-month", () => {
    // A clip lives a day, so the month's average storage is about one day's
    // uploads. That equivalence is what makes the free tier work at all.
    const averageStored = DAILY_BYTES * (TTL_SECONDS / 86400);
    expect(averageStored).toBeLessThan(10 * 1024 * 1024 * 1024);
  });

  test("and the worst-case clip still fits the daily count", () => {
    expect(DAILY_UPLOADS * MAX_BYTES).toBeGreaterThan(DAILY_BYTES);
  });
});
