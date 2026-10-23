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
    rate            REAL     NULL CHECK (rate BETWEEN 0 AND 100),
    event_name      TEXT     NULL,
    public_note     TEXT     NULL,
    private_note    TEXT     NULL,
    -- UTC 'YYYY-MM-DD HH:MM:SS.SSS': with milliseconds, so the latest-visit order (created_at as text)
    -- separates visits added in the same second.
    created_at      DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
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

-- 食べたメニュー: the items eaten on one visit, in display order. The visit's price is the sum of theirs.
-- No ON DELETE CASCADE: deleting a visit log deletes its items explicitly, in the same transaction.
CREATE TABLE IF NOT EXISTS visit_menu_items
(
    id           TEXT     NOT NULL PRIMARY KEY,
    visit_log_id TEXT     NOT NULL,
    name         TEXT     NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
    is_limited   INTEGER  NOT NULL DEFAULT 0 CHECK (is_limited IN (0, 1)),
    price        INTEGER  NULL CHECK (price BETWEEN 0 AND 10000000),
    sort_order   INTEGER  NOT NULL,
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (visit_log_id) REFERENCES visit_logs (id)
);

-- +goose StatementBegin
CREATE TRIGGER IF NOT EXISTS update_visit_menu_items_modtime
    AFTER UPDATE ON visit_menu_items
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE visit_menu_items SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
-- +goose StatementEnd

CREATE INDEX IF NOT EXISTS idx_visit_menu_items_visit_log_id ON visit_menu_items (visit_log_id);

-- 気になる度: low = ちょっと気になる, medium = 気になる, high = 絶対行きたい.
ALTER TABLE shops ADD COLUMN wish_level TEXT NULL CHECK (wish_level IN ('low', 'medium', 'high'));

-- Each eaten record becomes one visit log with an unknown visit date, keeping its id, rate and timestamps.
-- A rate of 0 was the old form's default for "not rated", so it becomes NULL. Rates were only range-checked
-- by the API, so another one outside 0..100 is clamped rather than failing the CHECK.
-- created_at is rewritten in the visit_logs format so text comparison orders it; a value strftime cannot
-- read whole (such as Go's '2006-01-02 15:04:05.999 +0000 UTC') is read from its first 19 characters.
INSERT INTO visit_logs (id, shop_id, visited_on, rate, created_at, updated_at)
SELECT lower(id), lower(shop_id), NULL, CASE WHEN rate = 0 THEN NULL ELSE max(0, min(100, rate)) END,
       coalesce(strftime('%Y-%m-%d %H:%M:%f', created_at),
                strftime('%Y-%m-%d %H:%M:%f', substr(created_at, 1, 19)),
                strftime('%Y-%m-%d %H:%M:%f', 'now')),
       updated_at
FROM eaten_shops;

DROP TABLE eaten_shops;

COMMIT;

PRAGMA foreign_keys = ON;

-- +goose Down

-- Not reversed: several visit logs per shop cannot go back into one eaten record without loss.
