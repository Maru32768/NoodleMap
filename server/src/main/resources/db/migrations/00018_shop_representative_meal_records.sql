-- +goose Up
CREATE TABLE shop_representative_meal_records (
    shop_id TEXT NOT NULL PRIMARY KEY,
    meal_record_id TEXT NOT NULL,
    FOREIGN KEY (meal_record_id, shop_id) REFERENCES meal_record_shops (meal_record_id, shop_id) ON DELETE CASCADE
);

-- +goose Down
DROP TABLE shop_representative_meal_records;
