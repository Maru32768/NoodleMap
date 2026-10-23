-- +goose NO TRANSACTION
-- +goose Up

-- foreign_keys is OFF while copying so that eaten records whose shop is gone (possible from before
-- enforcement applied) are kept as visit logs and reported at startup, instead of failing the boot.
-- The pragma is a no-op inside a transaction, hence NO TRANSACTION with an explicit BEGIN/COMMIT.
PRAGMA foreign_keys = OFF;

BEGIN;

-- 訪問ログ replaces the single eaten record per shop (docs/adr/0001-visit-logs-replace-eaten-records.md).
-- No ON DELETE CASCADE: a shop with visit logs cannot be deleted.
CREATE TABLE IF NOT EXISTS visit_logs
(
    id              TEXT     NOT NULL PRIMARY KEY,
    shop_id         TEXT     NOT NULL,
    visited_on      TEXT     NULL,
    menu_name       TEXT     NULL,
    is_limited_menu INTEGER  NOT NULL DEFAULT 0 CHECK (is_limited_menu IN (0, 1)),
    price           INTEGER  NULL CHECK (price >= 0),
    rate            REAL     NULL CHECK (rate BETWEEN 0 AND 100),
    event_name      TEXT     NULL,
    public_note     TEXT     NULL,
    private_note    TEXT     NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (shop_id) REFERENCES shops (id)
);

-- +goose StatementBegin
CREATE TRIGGER IF NOT EXISTS update_visit_logs_modtime
    AFTER UPDATE ON visit_logs
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE visit_logs SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
-- +goose StatementEnd

CREATE INDEX IF NOT EXISTS idx_visit_logs_shop_id ON visit_logs (shop_id);

-- 気になる度: low = ちょっと気になる, medium = 気になる, high = 絶対行きたい.
ALTER TABLE shops ADD COLUMN wish_level TEXT NULL CHECK (wish_level IN ('low', 'medium', 'high'));

-- Each eaten record becomes one visit log with an unknown visit date, keeping its id, rate and timestamps.
-- Rates were only range-checked by the API, so one outside 0..100 is clamped rather than failing the CHECK.
INSERT INTO visit_logs (id, shop_id, visited_on, rate, created_at, updated_at)
SELECT lower(id), lower(shop_id), NULL, max(0, min(100, rate)), created_at, updated_at
FROM eaten_shops;

DROP TABLE eaten_shops;

-- Never written by any handler; 訪問画像 will belong to visit logs instead.
DROP TABLE shop_images;

COMMIT;

PRAGMA foreign_keys = ON;

-- +goose Down

-- Not reversed: several visit logs per shop cannot go back into one eaten record without loss.
