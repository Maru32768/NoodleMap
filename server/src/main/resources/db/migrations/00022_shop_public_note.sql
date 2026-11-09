-- +goose Up
-- The shop's 公開メモ (GLOSSARY.md), trimmed. NULL means none.
ALTER TABLE shops ADD COLUMN public_note TEXT;

-- +goose Down
ALTER TABLE shops DROP COLUMN public_note;
