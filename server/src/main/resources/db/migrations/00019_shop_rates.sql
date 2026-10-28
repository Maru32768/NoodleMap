-- +goose Up
-- The shop's お気に入り度 is now its own value instead of following its latest rated meal record.
ALTER TABLE shops ADD COLUMN rate REAL CHECK (rate BETWEEN 0 AND 100);

-- Start from what was derived until now: the latest meal record that has one (GLOSSARY.md 食べた記録).
UPDATE shops SET rate = (
    SELECT m.rate
    FROM meal_records m
    JOIN meal_record_shops ms ON ms.meal_record_id = m.id
    WHERE ms.shop_id = shops.id AND m.rate IS NOT NULL
    ORDER BY m.eaten_on IS NULL, m.eaten_on DESC, m.created_at DESC, m.id DESC
    LIMIT 1
);

-- +goose Down
ALTER TABLE shops DROP COLUMN rate;
