-- +goose Up

CREATE TABLE IF NOT EXISTS tags
(
    id         TEXT     NOT NULL PRIMARY KEY,
    category   TEXT     NULL CHECK (category IN ('ramen', 'udon')),
    label      TEXT     NOT NULL,
    slug       TEXT     NOT NULL UNIQUE,
    color      TEXT     NOT NULL,
    sort_order INTEGER  NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- +goose StatementBegin
CREATE TRIGGER IF NOT EXISTS update_tags_modtime
    AFTER UPDATE ON tags
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE tags SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
-- +goose StatementEnd

CREATE TABLE IF NOT EXISTS shops_tags
(
    id         TEXT     NOT NULL PRIMARY KEY,
    shop_id    TEXT     NOT NULL,
    tag_id     TEXT     NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (shop_id) REFERENCES shops (id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags (id) ON DELETE CASCADE,
    UNIQUE (shop_id, tag_id)
);

-- +goose StatementBegin
CREATE TRIGGER IF NOT EXISTS update_shops_tags_modtime
    AFTER UPDATE ON shops_tags
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE shops_tags SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
-- +goose StatementEnd

CREATE INDEX IF NOT EXISTS idx_shops_tags_shop_id ON shops_tags (shop_id);
CREATE INDEX IF NOT EXISTS idx_shops_tags_tag_id ON shops_tags (tag_id);
CREATE INDEX IF NOT EXISTS idx_tags_category_sort_order ON tags (category, sort_order);

INSERT INTO tags (id, category, label, slug, color, sort_order)
VALUES
       ('018ff6e8-5291-7a01-9ab8-000000000001', 'ramen', '醤油', 'shoyu-ramen', '#92400e', 10),
       ('018ff6e8-5291-7a01-9ab8-000000000002', 'ramen', '塩', 'shio-ramen', '#64748b', 20),
       ('018ff6e8-5291-7a01-9ab8-000000000003', 'ramen', '味噌', 'miso-ramen', '#d97706', 30),
       ('018ff6e8-5291-7a01-9ab8-000000000004', 'ramen', '煮干し', 'niboshi-ramen', '#2563eb', 40),
       ('018ff6e8-5291-7a01-9ab8-000000000005', 'ramen', '豚骨', 'tonkotsu-ramen', '#a16207', 50),
       ('018ff6e8-5291-7a01-9ab8-000000000006', 'ramen', '家系', 'iekei', '#dc2626', 60),
       ('018ff6e8-5291-7a01-9ab8-000000000007', 'ramen', 'つけ麺', 'tsukemen', '#7c3aed', 70),
       ('018ff6e8-5291-7a01-9ab8-000000000008', 'ramen', '鶏水', 'torisui-ramen', '#16a34a', 80),
       ('018ff6e8-5291-7a01-9ab8-000000000009', 'ramen', '鶏白湯', 'tori-paitan-ramen', '#0f766e', 90),
       ('018ff6e8-5291-7a01-9ab8-000000000010', 'ramen', '昆布水', 'kombusui', '#65a30d', 100),
       ('018ff6e8-5291-7a01-9ab8-000000000011', 'ramen', '二郎系', 'jiro-ramen', '#b91c1c', 110),
       ('018ff6e8-5291-7a01-9ab8-000000000012', 'ramen', '担々麺', 'tantanmen', '#e11d48', 120),
       ('018ff6e8-5291-7a01-9ab8-000000000013', 'ramen', '油そば', 'abura-soba', '#c2410c', 130),
       ('018ff6e8-5291-7a01-9ab8-000000000014', 'ramen', '貝出汁', 'kaidashi-ramen', '#0284c7', 140),
       ('018ff6e8-5291-7a01-9ab8-000000000015', 'udon', '讃岐', 'sanuki-udon', '#059669', 150),
       ('018ff6e8-5291-7a01-9ab8-000000000016', 'udon', '武蔵野', 'musashino-udon', '#166534', 160),
       ('018ff6e8-5291-7a01-9ab8-000000000017', 'udon', '氷見', 'himi-udon', '#0369a1', 170),
       ('018ff6e8-5291-7a01-9ab8-000000000018', 'udon', '稲庭', 'inaniwa-udon', '#7c2d12', 180),
       ('018ff6e8-5291-7a01-9ab8-000000000019', 'udon', '伊勢', 'ise-udon', '#7e22ce', 190),
       ('018ff6e8-5291-7a01-9ab8-000000000020', 'udon', '水沢', 'mizusawa-udon', '#0f766e', 200),
       ('018ff6e8-5291-7a01-9ab8-000000000021', 'udon', 'カレーうどん', 'curry-udon', '#ca8a04', 210),
       ('018ff6e8-5291-7a01-9ab8-000000000022', 'udon', 'ひやかけ', 'hiyakake-udon', '#0ea5e9', 220),
       ('018ff6e8-5291-7a01-9ab8-000000000023', NULL, '駅遠', 'far-from-station', '#475569', 230),
       ('018ff6e8-5291-7a01-9ab8-000000000024', NULL, '行列', 'queue', '#be123c', 240),
       ('018ff6e8-5291-7a01-9ab8-000000000025', NULL, '予約のみ', 'reservation-only', '#7f1d1d', 250),
       ('018ff6e8-5291-7a01-9ab8-000000000026', NULL, '予約可', 'reservation-available', '#4338ca', 260),
       ('018ff6e8-5291-7a01-9ab8-000000000027', NULL, '朝営業', 'morning-service', '#ea580c', 270),
       ('018ff6e8-5291-7a01-9ab8-000000000028', NULL, '老舗', 'long-established', '#854d0e', 280)
ON CONFLICT (slug) DO NOTHING;

-- +goose Down

DROP INDEX IF EXISTS idx_tags_category_sort_order;
DROP INDEX IF EXISTS idx_shops_tags_tag_id;
DROP INDEX IF EXISTS idx_shops_tags_shop_id;

DROP TRIGGER IF EXISTS update_shops_tags_modtime;
DROP TABLE IF EXISTS shops_tags;

DROP TRIGGER IF EXISTS update_tags_modtime;
DROP TABLE IF EXISTS tags;
