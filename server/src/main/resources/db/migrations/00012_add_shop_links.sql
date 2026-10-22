-- +goose Up

CREATE TABLE IF NOT EXISTS shop_links
(
    id         TEXT     NOT NULL PRIMARY KEY,
    shop_id    TEXT     NOT NULL,
    type       TEXT     NOT NULL CHECK (type IN ('official', 'twitter', 'instagram', 'facebook', 'tabelog', 'other')),
    label      TEXT     NULL,
    url        TEXT     NOT NULL,
    sort_order INTEGER  NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (shop_id) REFERENCES shops (id) ON DELETE CASCADE
);

-- +goose StatementBegin
CREATE TRIGGER IF NOT EXISTS update_shop_links_modtime
    AFTER UPDATE ON shop_links
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE shop_links SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
-- +goose StatementEnd

CREATE INDEX IF NOT EXISTS idx_shop_links_shop_id ON shop_links (shop_id);

-- +goose Down

DROP INDEX IF EXISTS idx_shop_links_shop_id;
DROP TRIGGER IF EXISTS update_shop_links_modtime;
DROP TABLE IF EXISTS shop_links;
