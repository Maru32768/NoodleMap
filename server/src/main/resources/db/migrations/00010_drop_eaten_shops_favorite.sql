-- +goose Up

-- Favorite is now derived from the rate (see ShopHandler.isFavorite). Raise existing
-- favorites to the threshold so they stay favorites, then drop the manual flag.
UPDATE eaten_shops SET rate = 80 WHERE favorite = 1 AND (rate IS NULL OR rate < 80);
ALTER TABLE eaten_shops DROP COLUMN favorite;

-- +goose Down

-- 00001 declared `favorite BOOLEAN NOT NULL`; ADD COLUMN needs a default for NOT NULL.
ALTER TABLE eaten_shops ADD COLUMN favorite BOOLEAN NOT NULL DEFAULT 0;
UPDATE eaten_shops SET favorite = rate >= 80;
