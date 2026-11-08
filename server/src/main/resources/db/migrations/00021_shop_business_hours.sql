-- +goose Up
-- 営業時間 (GLOSSARY.md) as the API's BusinessHours JSON, validated before it is written. NULL is 営業時間不明.
ALTER TABLE shops ADD COLUMN business_hours TEXT;

-- +goose Down
ALTER TABLE shops DROP COLUMN business_hours;
