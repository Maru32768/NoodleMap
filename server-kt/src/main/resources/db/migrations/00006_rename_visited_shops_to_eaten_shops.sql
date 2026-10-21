-- +goose Up

ALTER TABLE visited_shops RENAME TO eaten_shops;
DROP TRIGGER IF EXISTS update_visited_shops_modtime;

-- +goose StatementBegin
CREATE TRIGGER IF NOT EXISTS update_eaten_shops_modtime
    AFTER UPDATE ON eaten_shops
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE eaten_shops SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
-- +goose StatementEnd

-- +goose Down

DROP TRIGGER IF EXISTS update_eaten_shops_modtime;
ALTER TABLE eaten_shops RENAME TO visited_shops;

-- +goose StatementBegin
CREATE TRIGGER IF NOT EXISTS update_visited_shops_modtime
    AFTER UPDATE ON visited_shops
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE visited_shops SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
-- +goose StatementEnd
