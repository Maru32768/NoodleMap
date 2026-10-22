-- +goose Up

-- Favorite is now derived from the rate (see ShopHandler.isFavorite); the manual flag is discarded.
ALTER TABLE eaten_shops DROP COLUMN favorite;

-- +goose Down

ALTER TABLE eaten_shops ADD COLUMN favorite BOOLEAN NOT NULL DEFAULT 0;
