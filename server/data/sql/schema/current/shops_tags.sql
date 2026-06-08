-- Current schema snapshot for shops_tags, generated from goose migrations.
-- Do not edit by hand. Run `npm run db:schema:dump` from the repository root.

CREATE TABLE shops_tags
(
    id         TEXT     NOT NULL PRIMARY KEY,
    shop_id    TEXT     NOT NULL,
    tag_id     TEXT     NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (shop_id) REFERENCES shops (id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags (id) ON DELETE CASCADE,
    UNIQUE (shop_id, tag_id)
);

CREATE INDEX idx_shops_tags_shop_id ON shops_tags (shop_id);

CREATE INDEX idx_shops_tags_tag_id ON shops_tags (tag_id);

CREATE TRIGGER update_shops_tags_modtime
    AFTER UPDATE ON shops_tags
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE shops_tags SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
