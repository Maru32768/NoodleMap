-- +goose NO TRANSACTION
-- +goose Up

-- Preserve orphaned legacy shop references for the startup foreign-key report, as migration 00014 did.
PRAGMA foreign_keys = OFF;
BEGIN;

CREATE TABLE venues (
    id TEXT NOT NULL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);

-- Kotlin trim accepts Unicode whitespace. Import legacy names with the same boundary whitespace.
CREATE TEMP TABLE normalized_event_names AS
SELECT id, trim(event_name, char(9,10,11,12,13,28,29,30,31,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288)) AS name
FROM visit_logs;

INSERT INTO venues (id, name)
SELECT lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-8' || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6))), name
FROM normalized_event_names WHERE name <> '' GROUP BY name;

CREATE TABLE visit_logs_new (
    id TEXT NOT NULL PRIMARY KEY,
    venue_id TEXT,
    visited_on TEXT CHECK (visited_on IS NULL OR
        (visited_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(visited_on, '+0 days') IS visited_on)),
    rate REAL CHECK (rate BETWEEN 0 AND 100),
    public_note TEXT,
    private_note TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (venue_id) REFERENCES venues (id)
);

CREATE TABLE visit_log_shops (
    visit_log_id TEXT NOT NULL,
    shop_id TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    PRIMARY KEY (visit_log_id, shop_id),
    FOREIGN KEY (visit_log_id) REFERENCES visit_logs (id),
    FOREIGN KEY (shop_id) REFERENCES shops (id)
);

INSERT INTO visit_logs_new (id, venue_id, visited_on, rate, public_note, private_note, created_at, updated_at)
SELECT v.id, venue.id, v.visited_on, v.rate, v.public_note, v.private_note, v.created_at, v.updated_at
FROM visit_logs v LEFT JOIN normalized_event_names e ON e.id = v.id LEFT JOIN venues venue ON venue.name = e.name;

INSERT INTO visit_log_shops (visit_log_id, shop_id, sort_order)
SELECT id, shop_id, 0 FROM visit_logs;

DROP TABLE normalized_event_names;
DROP TABLE visit_logs;
ALTER TABLE visit_logs_new RENAME TO visit_logs;
CREATE INDEX idx_visit_logs_venue_id ON visit_logs (venue_id);
CREATE INDEX idx_visit_log_shops_shop_id ON visit_log_shops (shop_id);

-- +goose StatementBegin
CREATE TRIGGER update_visit_logs_modtime AFTER UPDATE ON visit_logs
FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE visit_logs SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
-- +goose StatementEnd

COMMIT;
PRAGMA foreign_keys = ON;
