#!/bin/bash

DB_NAME="noodle_map"
PSQL_OPTS="-U postgres -d ${DB_NAME}"

psql -U postgres -c "create database ${DB_NAME};"

psql $PSQL_OPTS -f /docker-entrypoint-initdb.d/categories/schema.sql
psql $PSQL_OPTS -f /docker-entrypoint-initdb.d/users/schema.sql
psql $PSQL_OPTS -f /docker-entrypoint-initdb.d/temporary_users/schema.sql
psql $PSQL_OPTS -f /docker-entrypoint-initdb.d/restaurants/schema.sql

psql $PSQL_OPTS -c "
copy categories (id, label, icon)
    from '/docker-entrypoint-initdb.d/data/categories.csv'
    delimiter ','
    csv header;
"

psql $PSQL_OPTS -c "
copy restaurants (id, google_place_id, name, postal_code, address, closed, lat, lng)
    from '/docker-entrypoint-initdb.d/data/ramen.csv'
    delimiter ','
    csv header;
"

psql $PSQL_OPTS -c "
copy restaurants (id, google_place_id, name, postal_code, address, closed, lat, lng)
    from '/docker-entrypoint-initdb.d/data/udon.csv'
    delimiter ','
    csv header;
"

psql $PSQL_OPTS -c "
copy restaurants_categories (id, restaurant_id, category_id)
    from '/docker-entrypoint-initdb.d/data/restaurants_categories.csv'
    delimiter ','
    csv header;
"

psql $PSQL_OPTS -c "
copy visited_restaurants (id, restaurant_id, rate, favorite)
    from '/docker-entrypoint-initdb.d/data/visited_restaurants.csv'
    delimiter ','
    csv header;
"
