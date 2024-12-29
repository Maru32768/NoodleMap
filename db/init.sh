#!/bin/bash

DB_NAME="noodle_map"

psql -U postgres -c "create database ${DB_NAME};"

psql -U postgres -d ${DB_NAME} -f /docker-entrypoint-initdb.d/users/schema.sql
psql -U postgres -d ${DB_NAME} -f /docker-entrypoint-initdb.d/temporary_users/schema.sql
psql -U postgres ${DB_NAME} -f /docker-entrypoint-initdb.d/restaurants/schema.sql

psql -U postgres -d ${DB_NAME} -c "
copy restaurants (id, google_place_id, name, postal_code, address, lat, lng)
    from '/docker-entrypoint-initdb.d/testing/ramen.csv'
    delimiter ','
    csv header;
"

psql -U postgres ${DB_NAME} -f /docker-entrypoint-initdb.d/testing/init-data.sql
