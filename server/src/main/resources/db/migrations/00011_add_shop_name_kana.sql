-- +goose Up

ALTER TABLE shops ADD COLUMN name_kana TEXT;

-- +goose Down

ALTER TABLE shops DROP COLUMN name_kana;
