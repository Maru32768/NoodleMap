-- +goose Up

ALTER TABLE restaurants RENAME TO shops;
DROP TRIGGER IF EXISTS update_restaurants_modtime;

-- +goose StatementBegin
CREATE TRIGGER IF NOT EXISTS update_shops_modtime
    AFTER UPDATE ON shops
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE shops SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
-- +goose StatementEnd

ALTER TABLE visited_restaurants RENAME TO visited_shops;
ALTER TABLE visited_shops RENAME COLUMN restaurant_id TO shop_id;
DROP TRIGGER IF EXISTS update_visited_restaurants_modtime;

-- +goose StatementBegin
CREATE TRIGGER IF NOT EXISTS update_visited_shops_modtime
    AFTER UPDATE ON visited_shops
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE visited_shops SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
-- +goose StatementEnd

ALTER TABLE restaurant_images RENAME TO shop_images;
ALTER TABLE shop_images RENAME COLUMN restaurant_id TO shop_id;
DROP TRIGGER IF EXISTS update_restaurant_images_modtime;

-- +goose StatementBegin
CREATE TRIGGER IF NOT EXISTS update_shop_images_modtime
    AFTER UPDATE ON shop_images
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE shop_images SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
-- +goose StatementEnd

-- +goose Down

DROP TRIGGER IF EXISTS update_shop_images_modtime;
ALTER TABLE shop_images RENAME COLUMN shop_id TO restaurant_id;
ALTER TABLE shop_images RENAME TO restaurant_images;

-- +goose StatementBegin
CREATE TRIGGER IF NOT EXISTS update_restaurant_images_modtime
    AFTER UPDATE ON restaurant_images
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE restaurant_images SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS update_visited_shops_modtime;
ALTER TABLE visited_shops RENAME COLUMN shop_id TO restaurant_id;
ALTER TABLE visited_shops RENAME TO visited_restaurants;

-- +goose StatementBegin
CREATE TRIGGER IF NOT EXISTS update_visited_restaurants_modtime
    AFTER UPDATE ON visited_restaurants
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE visited_restaurants SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS update_shops_modtime;
ALTER TABLE shops RENAME TO restaurants;

-- +goose StatementBegin
CREATE TRIGGER IF NOT EXISTS update_restaurants_modtime
    AFTER UPDATE ON restaurants
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE restaurants SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
-- +goose StatementEnd
