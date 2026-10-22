-- +goose NO TRANSACTION
-- +goose Up

PRAGMA foreign_keys = OFF;

UPDATE sessions
SET id = lower(id),
    user_id = lower(user_id);

UPDATE users
SET id = lower(id);

UPDATE shop_images
SET id = lower(id),
    shop_id = lower(shop_id);

UPDATE eaten_shops
SET id = lower(id),
    shop_id = lower(shop_id);

UPDATE shops_tags
SET id = lower(id),
    shop_id = lower(shop_id),
    tag_id = lower(tag_id);

UPDATE tags
SET id = lower(id);

UPDATE shops
SET id = lower(id);

PRAGMA foreign_key_check;
PRAGMA foreign_keys = ON;

-- +goose Down

-- UUID text case normalization is intentionally irreversible.
