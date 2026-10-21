-- +goose Up

DROP TRIGGER IF EXISTS update_restaurants_categories_modtime;

CREATE TABLE restaurants_categories_new
(
    id            TEXT     NOT NULL PRIMARY KEY,
    restaurant_id TEXT     NOT NULL,
    category_id   TEXT     NOT NULL CHECK (category_id IN ('ramen', 'udon')),
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (restaurant_id) REFERENCES restaurants (id)
);

INSERT INTO restaurants_categories_new (id, restaurant_id, category_id, created_at, updated_at)
SELECT id,
       restaurant_id,
       CASE category_id
           WHEN '3764697a-f4e9-475a-b3e2-9ba296419090' THEN 'ramen'
           WHEN '8e7eeef5-7d24-43d8-9e55-7ec4f732291b' THEN 'udon'
           ELSE category_id
       END,
       created_at,
       updated_at
FROM restaurants_categories
WHERE category_id IN (
    '3764697a-f4e9-475a-b3e2-9ba296419090',
    '8e7eeef5-7d24-43d8-9e55-7ec4f732291b',
    'ramen',
    'udon'
);

DROP TABLE restaurants_categories;
ALTER TABLE restaurants_categories_new RENAME TO restaurants_categories;

-- +goose StatementBegin
CREATE TRIGGER IF NOT EXISTS update_restaurants_categories_modtime
    AFTER UPDATE ON restaurants_categories
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE restaurants_categories SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS update_categories_modtime;
DROP TABLE IF EXISTS categories;

-- +goose Down

CREATE TABLE IF NOT EXISTS categories
(
    id         TEXT     NOT NULL PRIMARY KEY,
    label      TEXT     NOT NULL,
    icon       TEXT     NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- +goose StatementBegin
CREATE TRIGGER IF NOT EXISTS update_categories_modtime
    AFTER UPDATE ON categories
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE categories SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
-- +goose StatementEnd

INSERT OR IGNORE INTO categories (id, label, icon)
VALUES ('3764697a-f4e9-475a-b3e2-9ba296419090', 'ラーメン', ''),
       ('8e7eeef5-7d24-43d8-9e55-7ec4f732291b', 'うどん', '');

DROP TRIGGER IF EXISTS update_restaurants_categories_modtime;

CREATE TABLE restaurants_categories_old
(
    id            TEXT     NOT NULL PRIMARY KEY,
    restaurant_id TEXT     NOT NULL,
    category_id   TEXT     NOT NULL,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (restaurant_id) REFERENCES restaurants (id),
    FOREIGN KEY (category_id) REFERENCES categories (id)
);

INSERT INTO restaurants_categories_old (id, restaurant_id, category_id, created_at, updated_at)
SELECT id,
       restaurant_id,
       CASE category_id
           WHEN 'ramen' THEN '3764697a-f4e9-475a-b3e2-9ba296419090'
           WHEN 'udon' THEN '8e7eeef5-7d24-43d8-9e55-7ec4f732291b'
           ELSE category_id
       END,
       created_at,
       updated_at
FROM restaurants_categories;

DROP TABLE restaurants_categories;
ALTER TABLE restaurants_categories_old RENAME TO restaurants_categories;

-- +goose StatementBegin
CREATE TRIGGER IF NOT EXISTS update_restaurants_categories_modtime
    AFTER UPDATE ON restaurants_categories
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE restaurants_categories SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
-- +goose StatementEnd
