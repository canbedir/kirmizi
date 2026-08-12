-- Adds the view counter to a database created before it existed.
-- Run once against each deployment:
--   bunx wrangler d1 execute kirmizi-shares --remote --file=migrations/0001-views.sql
ALTER TABLE shares ADD COLUMN views INTEGER NOT NULL DEFAULT 0;
