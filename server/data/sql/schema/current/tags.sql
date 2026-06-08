-- Current schema snapshot for tags, generated from goose migrations.
-- Do not edit by hand. Run `npm run db:schema:dump` from the repository root.

CREATE TABLE tags
(
    id         TEXT     NOT NULL PRIMARY KEY,
    category   TEXT     NULL CHECK (category IN ('ramen', 'udon')),
    label      TEXT     NOT NULL,
    slug       TEXT     NOT NULL UNIQUE,
    color      TEXT     NOT NULL,
    sort_order INTEGER  NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tags_category_sort_order ON tags (category, sort_order);

CREATE TRIGGER update_tags_modtime
    AFTER UPDATE ON tags
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE tags SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
