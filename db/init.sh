#!/bin/bash
# SQLite seed script for local development.
# Prerequisites: start the server once first so goose creates the schema, then stop it.
# Usage: DB_PATH=/work/data/noodle_map.db bash db/init.sh

set -e

DB_PATH="${DB_PATH:-/work/data/noodle_map.db}"
DATA_DIR="$(cd "$(dirname "$0")/data" && pwd)"

# categories: CSV columns (ID, LABEL, ICON) exclude timestamp columns
sqlite3 "$DB_PATH" <<SQL
.mode csv
CREATE TEMP TABLE tmp_categories (id, label, icon);
.import --skip 1 ${DATA_DIR}/categories.csv tmp_categories
INSERT OR IGNORE INTO categories (id, label, icon)
SELECT id, label, icon
FROM tmp_categories;
DROP TABLE tmp_categories;
SQL

# restaurants: CSV columns (ID,GOOGLE_PLACE_ID,NAME,POSTAL_CODE,ADDRESS,CLOSED,LAT,LNG)
# differ from table order and CLOSED is TRUE/FALSE string
sqlite3 "$DB_PATH" <<SQL
.mode csv
CREATE TEMP TABLE tmp_restaurants (id, google_place_id, name, postal_code, address, closed, lat, lng);
.import --skip 1 ${DATA_DIR}/ramen.csv tmp_restaurants
.import --skip 1 ${DATA_DIR}/udon.csv tmp_restaurants
INSERT OR IGNORE INTO restaurants (id, name, lat, lng, postal_code, address, google_place_id, closed)
SELECT id, name, CAST(lat AS REAL), CAST(lng AS REAL), postal_code, address, google_place_id,
       CASE WHEN upper(closed) = 'TRUE' THEN 1 ELSE 0 END
FROM tmp_restaurants;
DROP TABLE tmp_restaurants;
SQL

# restaurants_categories: CSV columns (id,restaurant_id,category_id) exclude timestamp columns
sqlite3 "$DB_PATH" <<SQL
.mode csv
CREATE TEMP TABLE tmp_restaurants_categories (id, restaurant_id, category_id);
.import --skip 1 ${DATA_DIR}/restaurants_categories.csv tmp_restaurants_categories
INSERT OR IGNORE INTO restaurants_categories (id, restaurant_id, category_id)
SELECT id, restaurant_id, category_id
FROM tmp_restaurants_categories;
DROP TABLE tmp_restaurants_categories;
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
