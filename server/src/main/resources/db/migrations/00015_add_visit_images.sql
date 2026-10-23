-- +goose Up

-- 訪問画像: photos of one visit log, in display order (the first one represents the visit).
-- The JPEG itself lives in object storage under storage_key. No ON DELETE CASCADE: deleting a visit
-- log deletes its image rows explicitly so that the stored objects are removed with them.
CREATE TABLE IF NOT EXISTS visit_images
(
    id           TEXT     NOT NULL PRIMARY KEY,
    visit_log_id TEXT     NOT NULL,
    storage_key  TEXT     NOT NULL,
    width        INTEGER  NOT NULL CHECK (width > 0),
    height       INTEGER  NOT NULL CHECK (height > 0),
    caption      TEXT     NULL CHECK (length(caption) <= 100),
    sort_order   INTEGER  NOT NULL,
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (visit_log_id) REFERENCES visit_logs (id)
);

-- +goose StatementBegin
CREATE TRIGGER IF NOT EXISTS update_visit_images_modtime
    AFTER UPDATE ON visit_images
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE visit_images SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
-- +goose StatementEnd

CREATE INDEX IF NOT EXISTS idx_visit_images_visit_log_id ON visit_images (visit_log_id);

-- +goose Down

DROP TABLE IF EXISTS visit_images;
