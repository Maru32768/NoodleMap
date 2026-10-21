-- +goose Up

ALTER TABLE restaurants ADD COLUMN category TEXT NOT NULL DEFAULT 'ramen' CHECK (category IN ('ramen', 'udon'));

UPDATE restaurants
SET category = (
    SELECT rc.category_id
    FROM restaurants_categories rc
    WHERE rc.restaurant_id = restaurants.id
    ORDER BY CASE rc.category_id WHEN 'udon' THEN 0 ELSE 1 END
    LIMIT 1
)
WHERE EXISTS (
    SELECT 1
    FROM restaurants_categories rc
    WHERE rc.restaurant_id = restaurants.id
);

DROP TRIGGER IF EXISTS update_restaurants_categories_modtime;
DROP TABLE IF EXISTS restaurants_categories;

-- +goose Down

CREATE TABLE IF NOT EXISTS restaurants_categories
(
    id            TEXT     NOT NULL PRIMARY KEY,
    restaurant_id TEXT     NOT NULL,
    category_id   TEXT     NOT NULL CHECK (category_id IN ('ramen', 'udon')),
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (restaurant_id) REFERENCES restaurants (id)
);

INSERT OR IGNORE INTO restaurants_categories (id, restaurant_id, category_id)
SELECT id || '-category', id, category
FROM restaurants;

-- +goose StatementBegin
CREATE TRIGGER IF NOT EXISTS update_restaurants_categories_modtime
    AFTER UPDATE ON restaurants_categories
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE restaurants_categories SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
-- +goose StatementEnd

ALTER TABLE restaurants DROP COLUMN category;
