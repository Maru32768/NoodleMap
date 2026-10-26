-- +goose Up

DROP TRIGGER update_visit_logs_modtime;
DROP TRIGGER update_visit_menu_items_modtime;
DROP TRIGGER update_visit_images_modtime;

ALTER TABLE visit_logs RENAME TO meal_records;
ALTER TABLE meal_records RENAME COLUMN visited_on TO eaten_on;
ALTER TABLE visit_log_shops RENAME TO meal_record_shops;
ALTER TABLE meal_record_shops RENAME COLUMN visit_log_id TO meal_record_id;
ALTER TABLE visit_menu_items RENAME TO meal_record_menu_items;
ALTER TABLE meal_record_menu_items RENAME COLUMN visit_log_id TO meal_record_id;
ALTER TABLE visit_images RENAME TO meal_record_images;
ALTER TABLE meal_record_images RENAME COLUMN visit_log_id TO meal_record_id;

DROP INDEX idx_visit_logs_venue_id;
DROP INDEX idx_visit_log_shops_shop_id;
DROP INDEX idx_visit_menu_items_visit_log_id;
DROP INDEX idx_visit_images_visit_log_id;
CREATE INDEX idx_meal_records_venue_id ON meal_records (venue_id);
CREATE INDEX idx_meal_record_shops_shop_id ON meal_record_shops (shop_id);
CREATE INDEX idx_meal_record_menu_items_meal_record_id ON meal_record_menu_items (meal_record_id);
CREATE INDEX idx_meal_record_images_meal_record_id ON meal_record_images (meal_record_id);

-- Copy remote images before this migration. Local images are copied before their store opens.
UPDATE meal_record_images SET storage_key = 'meal-records/' || substr(storage_key, 8)
WHERE substr(storage_key, 1, 7) = 'visits/';

-- +goose StatementBegin
CREATE TRIGGER update_meal_records_modtime AFTER UPDATE ON meal_records
FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE meal_records SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TRIGGER update_meal_record_menu_items_modtime AFTER UPDATE ON meal_record_menu_items
FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE meal_record_menu_items SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TRIGGER update_meal_record_images_modtime AFTER UPDATE ON meal_record_images
FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE meal_record_images SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
-- +goose StatementEnd
