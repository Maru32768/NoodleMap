#!/bin/bash
# SQLite seed script for local development.
# Prerequisites: start the server once first so goose creates the schema, then stop it.
# Usage: DB_PATH=/work/data/noodle_map.db bash db/init.sh

set -e

DB_PATH="${DB_PATH:-/work/data/noodle_map.db}"
DATA_DIR="$(cd "$(dirname "$0")/data" && pwd)"

# shops: CSV columns (ID,GOOGLE_PLACE_ID,NAME,POSTAL_CODE,ADDRESS,CLOSED,LAT,LNG)
# differ from table order and CLOSED is TRUE/FALSE string
sqlite3 "$DB_PATH" <<SQL
.mode csv
CREATE TEMP TABLE tmp_shops (id, google_place_id, name, postal_code, address, closed, lat, lng);
.import --skip 1 ${DATA_DIR}/ramen.csv tmp_shops
INSERT OR IGNORE INTO shops (id, name, lat, lng, postal_code, address, google_place_id, closed, category)
SELECT id, name, CAST(lat AS REAL), CAST(lng AS REAL), postal_code, address, google_place_id,
       CASE WHEN upper(closed) = 'TRUE' THEN 1 ELSE 0 END,
       'ramen'
FROM tmp_shops;
DELETE FROM tmp_shops;
.import --skip 1 ${DATA_DIR}/udon.csv tmp_shops
INSERT OR IGNORE INTO shops (id, name, lat, lng, postal_code, address, google_place_id, closed, category)
SELECT id, name, CAST(lat AS REAL), CAST(lng AS REAL), postal_code, address, google_place_id,
       CASE WHEN upper(closed) = 'TRUE' THEN 1 ELSE 0 END,
       'udon'
FROM tmp_shops;
DROP TABLE tmp_shops;
SQL

# visited_shops: CSV columns (id,shop_id,rate,favorite) match table order
# favorite is false/true string
sqlite3 "$DB_PATH" <<SQL
.mode csv
CREATE TEMP TABLE tmp_visited (id, shop_id, rate, favorite);
.import --skip 1 ${DATA_DIR}/visited_shops.csv tmp_visited
INSERT OR IGNORE INTO visited_shops (id, shop_id, rate, favorite)
SELECT id, shop_id, CAST(rate AS REAL),
       CASE WHEN lower(favorite) = 'true' THEN 1 ELSE 0 END
FROM tmp_visited;
DROP TABLE tmp_visited;
SQL

echo "seed complete: $DB_PATH"
