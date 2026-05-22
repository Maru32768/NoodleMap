#!/bin/bash

DB_NAME="noodle_map"
PSQL_OPTS="-U postgres -d ${DB_NAME}"

psql -U postgres -c "create database ${DB_NAME};"

goose -dir /migrations postgres "host=/var/run/postgresql user=postgres dbname=${DB_NAME} sslmode=disable" up

psql $PSQL_OPTS -c "
insert into users (id, email, password, salt, is_admin)
values (
    '0db3f068-b86b-4ae3-875a-868b6108b087',
    'admin@example.com',
    '\$2a\$10\$Nl82/aKPd8Pd/l8Ol93Qde2GmbWz3QAap.xibUog3ygKm9hCUNGWS',
    'aa92d84c-c770-4bb1-8e9f-ce1e4066f42f',
    true
);
"

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
