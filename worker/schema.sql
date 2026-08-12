-- Everything the share endpoint remembers.
--
-- Two tables and no more: what is stored, and how much has been stored today.
-- There is no user, no session and no log of who fetched what — a link is the
-- only thing that identifies a clip, and it belongs to whoever holds it.

CREATE TABLE IF NOT EXISTS shares (
  id           TEXT PRIMARY KEY,
  -- The object in R2. Derived from the id, but stored so a change to the
  -- naming scheme can't orphan the objects already written.
  key          TEXT NOT NULL,
  bytes        INTEGER NOT NULL,
  seconds      REAL NOT NULL,
  width        INTEGER NOT NULL,
  height       INTEGER NOT NULL,
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  -- Held only by whoever uploaded it, so a link can be taken down early
  -- without anybody needing an account.
  delete_token TEXT NOT NULL,
  -- How many people opened it. Counted once an hour per salted address hash,
  -- so a reload is not a viewer and no address is kept to work that out.
  views INTEGER NOT NULL DEFAULT 0
);

-- The sweeper's only query.
CREATE INDEX IF NOT EXISTS shares_expires_at ON shares (expires_at);

-- Counters, keyed by what they count: "day:2026-08-11" for everyone together,
-- and a salted hash per address for the per-person limits. The address itself
-- is never written — the hash is enough to count against and useless as a log.
CREATE TABLE IF NOT EXISTS usage (
  bucket   TEXT PRIMARY KEY,
  bytes    INTEGER NOT NULL DEFAULT 0,
  uploads  INTEGER NOT NULL DEFAULT 0,
  -- So old counters can be swept with the same cron as the clips.
  stale_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS usage_stale_at ON usage (stale_at);
