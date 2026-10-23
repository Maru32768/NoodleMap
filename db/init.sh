#!/bin/bash
# SQLite seed script for local development.
# Prerequisites: start the server once first so its migrations create the schema, then stop it.
# Usage: DB_PATH=db-data/noodle_map.db bash db/init.sh

set -e

DB_PATH="${DB_PATH:-/work/data/noodle_map.db}"
DATA_DIR="$(cd "$(dirname "$0")/data" && pwd)"

# shops: CSV columns (ID,GOOGLE_PLACE_ID,NAME,POSTAL_CODE,ADDRESS,CLOSED,LAT,LNG)
# differ from table order and CLOSED is TRUE/FALSE string. A blank GOOGLE_PLACE_ID (shop entered
# by hand) loads as NULL: the column is UNIQUE and only NULLs may repeat.
sqlite3 "$DB_PATH" <<SQL
.mode csv
CREATE TEMP TABLE tmp_shops (id, google_place_id, name, postal_code, address, closed, lat, lng);
.import --skip 1 ${DATA_DIR}/ramen.csv tmp_shops
INSERT OR IGNORE INTO shops (id, name, lat, lng, postal_code, address, google_place_id, closed_at, category)
SELECT lower(id), name, CAST(lat AS REAL), CAST(lng AS REAL), postal_code, address, NULLIF(trim(google_place_id), ''),
       CASE WHEN upper(closed) = 'TRUE' THEN datetime('now', '-1 month') ELSE NULL END,
       'ramen'
FROM tmp_shops;
DELETE FROM tmp_shops;
.import --skip 1 ${DATA_DIR}/udon.csv tmp_shops
INSERT OR IGNORE INTO shops (id, name, lat, lng, postal_code, address, google_place_id, closed_at, category)
SELECT lower(id), name, CAST(lat AS REAL), CAST(lng AS REAL), postal_code, address, NULLIF(trim(google_place_id), ''),
       CASE WHEN upper(closed) = 'TRUE' THEN datetime('now', '-1 month') ELSE NULL END,
       'udon'
FROM tmp_shops;
DROP TABLE tmp_shops;
SQL

# eaten_shops.csv (id,shop_id,rate): each row is one 訪問ログ with an unknown visit date, as the
# migration converted the former eaten_shops table.
sqlite3 "$DB_PATH" <<SQL
.mode csv
CREATE TEMP TABLE tmp_eaten (id, shop_id, rate);
.import --skip 1 ${DATA_DIR}/eaten_shops.csv tmp_eaten
INSERT OR IGNORE INTO visit_logs (id, shop_id, visited_on, rate)
SELECT lower(id), lower(shop_id), NULL, CAST(rate AS REAL)
FROM tmp_eaten;
DROP TABLE tmp_eaten;
SQL

echo "seed complete: $DB_PATH"
