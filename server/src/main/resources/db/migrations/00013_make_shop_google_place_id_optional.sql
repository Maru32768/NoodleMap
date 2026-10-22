-- +goose NO TRANSACTION
-- +goose Up

-- SQLite cannot relax NOT NULL in place, so `shops` is rebuilt
-- (https://www.sqlite.org/lang_altertable.html#otheralter). foreign_keys must be OFF, and that
-- pragma is a no-op inside a transaction: with it ON, dropping the old table would cascade-delete
-- shops_tags and shop_links rows. UNIQUE stays; SQLite treats NULLs as distinct.
PRAGMA foreign_keys = OFF;

BEGIN;

CREATE TABLE shops_new
(
    id              TEXT     NOT NULL PRIMARY KEY,
    name            TEXT     NOT NULL,
    lat             REAL     NOT NULL,
    lng             REAL     NOT NULL,
    postal_code     TEXT     NOT NULL,
    address         TEXT     NOT NULL,
    google_place_id TEXT     NULL UNIQUE,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    category        TEXT     NOT NULL DEFAULT 'ramen' CHECK (category IN ('ramen', 'udon')),
    opened_at       DATETIME,
    closed_at       DATETIME,
    name_kana       TEXT
);

-- '' was the stand-in for "no place id" and allowed only one such shop.
INSERT INTO shops_new (id, name, lat, lng, postal_code, address, google_place_id, created_at, updated_at,
                       category, opened_at, closed_at, name_kana)
SELECT id, name, lat, lng, postal_code, address, NULLIF(google_place_id, ''), created_at, updated_at,
       category, opened_at, closed_at, name_kana
FROM shops;

DROP TABLE shops;
ALTER TABLE shops_new RENAME TO shops;

-- +goose StatementBegin
CREATE TRIGGER IF NOT EXISTS update_shops_modtime
    AFTER UPDATE ON shops
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE shops SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
-- +goose StatementEnd

PRAGMA foreign_key_check;

COMMIT;

PRAGMA foreign_keys = ON;

-- +goose Down

-- Shops without a place id cannot go back to the NOT NULL UNIQUE column, so this is not reversed.
