#!/bin/bash
# SQLite seed script for local development.
# Prerequisites: start the server once first so goose creates the schema, then stop it.
# Usage: DB_PATH=/work/data/noodle_map.db bash db/init.sh

set -e

DB_PATH="${DB_PATH:-/work/data/noodle_map.db}"
DATA_DIR="$(cd "$(dirname "$0")/data" && pwd)"

# restaurants: CSV columns (ID,GOOGLE_PLACE_ID,NAME,POSTAL_CODE,ADDRESS,CLOSED,LAT,LNG)
# differ from table order and CLOSED is TRUE/FALSE string
sqlite3 "$DB_PATH" <<SQL
.mode csv
CREATE TEMP TABLE tmp_restaurants (id, google_place_id, name, postal_code, address, closed, lat, lng);
.import --skip 1 ${DATA_DIR}/ramen.csv tmp_restaurants
INSERT OR IGNORE INTO restaurants (id, name, lat, lng, postal_code, address, google_place_id, closed, category)
SELECT id, name, CAST(lat AS REAL), CAST(lng AS REAL), postal_code, address, google_place_id,
       CASE WHEN upper(closed) = 'TRUE' THEN 1 ELSE 0 END,
       'ramen'
FROM tmp_restaurants;
DELETE FROM tmp_restaurants;
.import --skip 1 ${DATA_DIR}/udon.csv tmp_restaurants
INSERT OR IGNORE INTO restaurants (id, name, lat, lng, postal_code, address, google_place_id, closed, category)
SELECT id, name, CAST(lat AS REAL), CAST(lng AS REAL), postal_code, address, google_place_id,
       CASE WHEN upper(closed) = 'TRUE' THEN 1 ELSE 0 END,
       'udon'
FROM tmp_restaurants;
DROP TABLE tmp_restaurants;
SQL

# visited_restaurants: CSV columns (id,restaurant_id,rate,favorite) match table order
# favorite is false/true string
sqlite3 "$DB_PATH" <<SQL
.mode csv
CREATE TEMP TABLE tmp_visited (id, restaurant_id, rate, favorite);
.import --skip 1 ${DATA_DIR}/visited_restaurants.csv tmp_visited
INSERT OR IGNORE INTO visited_restaurants (id, restaurant_id, rate, favorite)
SELECT id, restaurant_id, CAST(rate AS REAL),
       CASE WHEN lower(favorite) = 'true' THEN 1 ELSE 0 END
FROM tmp_visited;
DROP TABLE tmp_visited;
SQL

echo "seed complete: $DB_PATH"
