-- Current schema snapshot for shops, generated from goose migrations.
-- Do not edit by hand. Run `npm run db:schema:dump` from the repository root.

CREATE TABLE "shops"
(
    id              TEXT     NOT NULL PRIMARY KEY,
    name            TEXT     NOT NULL,
    lat             REAL     NOT NULL,
    lng             REAL     NOT NULL,
    postal_code     TEXT     NOT NULL,
    address         TEXT     NOT NULL,
    google_place_id TEXT     NOT NULL UNIQUE,
    closed          BOOLEAN  NOT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    category TEXT NOT NULL DEFAULT 'ramen' CHECK (category IN ('ramen', 'udon')));

CREATE TRIGGER update_shops_modtime
    AFTER UPDATE ON shops
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE shops SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
