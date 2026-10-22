-- +goose Up

ALTER TABLE shops ADD COLUMN opened_at DATETIME;
ALTER TABLE shops ADD COLUMN closed_at DATETIME;

-- Preserve existing closed shops. We don't know the real close date, so backfill
-- a datetime safely in the past (about a month ago) rather than the migration
-- date, so they read as already-closed (not "closing soon") regardless of
-- timezone.
UPDATE shops SET closed_at = datetime('now', '-1 month') WHERE closed = 1;

ALTER TABLE shops DROP COLUMN closed;

-- +goose Down

ALTER TABLE shops ADD COLUMN closed BOOLEAN NOT NULL DEFAULT 0;

UPDATE shops SET closed = 1 WHERE closed_at IS NOT NULL AND closed_at <= date('now');

ALTER TABLE shops DROP COLUMN closed_at;
ALTER TABLE shops DROP COLUMN opened_at;
