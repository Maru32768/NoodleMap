-- Current schema snapshot for eaten_shops, generated from goose migrations.
-- Do not edit by hand. Run `npm run db:schema:dump` from the repository root.

CREATE TABLE "eaten_shops"
(
    id            TEXT     NOT NULL PRIMARY KEY,
    shop_id TEXT     NOT NULL UNIQUE,
    rate          REAL     NOT NULL,
    favorite      BOOLEAN  NOT NULL,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (shop_id) REFERENCES "shops" (id)
);

CREATE TRIGGER update_eaten_shops_modtime
    AFTER UPDATE ON eaten_shops
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE eaten_shops SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
