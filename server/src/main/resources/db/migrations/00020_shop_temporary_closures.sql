-- +goose NO TRANSACTION
-- +goose Up

-- SQLite cannot change a CHECK in place, so `shop_links` is rebuilt to allow 'reservation'
-- (https://www.sqlite.org/lang_altertable.html#otheralter). Nothing references shop_links, but
-- foreign_keys stays OFF for the rebuild as in 00013, and that pragma is a no-op inside a transaction.
PRAGMA foreign_keys = OFF;

BEGIN;

-- 臨時休業 (GLOSSARY.md): one per shop, judged against today like closed_at, so nothing runs on a schedule.
ALTER TABLE shops ADD COLUMN temporary_closure_starts_on TEXT;
ALTER TABLE shops ADD COLUMN temporary_closure_reopens_on TEXT;

CREATE TABLE shop_links_new
(
    id         TEXT     NOT NULL PRIMARY KEY,
    shop_id    TEXT     NOT NULL,
    type       TEXT     NOT NULL CHECK (type IN ('official', 'twitter', 'instagram', 'facebook', 'tabelog', 'reservation', 'other')),
    label      TEXT     NULL,
    url        TEXT     NOT NULL,
    sort_order INTEGER  NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (shop_id) REFERENCES shops (id) ON DELETE CASCADE
);

INSERT INTO shop_links_new (id, shop_id, type, label, url, sort_order, created_at, updated_at)
SELECT id, shop_id, type, label, url, sort_order, created_at, updated_at
FROM shop_links;

DROP TABLE shop_links;
ALTER TABLE shop_links_new RENAME TO shop_links;

CREATE INDEX IF NOT EXISTS idx_shop_links_shop_id ON shop_links (shop_id);

-- +goose StatementBegin
CREATE TRIGGER IF NOT EXISTS update_shop_links_modtime
    AFTER UPDATE ON shop_links
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE shop_links SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
-- +goose StatementEnd

PRAGMA foreign_key_check;

COMMIT;

PRAGMA foreign_keys = ON;
