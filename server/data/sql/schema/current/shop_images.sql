-- Current schema snapshot for shop_images, generated from goose migrations.
-- Do not edit by hand. Run `npm run db:schema:dump` from the repository root.

CREATE TABLE "shop_images"
(
    id            TEXT     NOT NULL PRIMARY KEY,
    shop_id TEXT     NOT NULL,
    path          TEXT     NOT NULL,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (shop_id) REFERENCES "shops" (id)
);

CREATE TRIGGER update_shop_images_modtime
    AFTER UPDATE ON shop_images
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE shop_images SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
