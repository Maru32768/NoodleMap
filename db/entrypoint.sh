#!/bin/sh
set -e

goose -dir /work/data/sql/migrations sqlite3 "$DB_PATH" up

if [ "$(sqlite3 "$DB_PATH" 'SELECT ((SELECT COUNT(*) FROM categories) = 0) OR ((SELECT COUNT(*) FROM restaurants) = 0) OR ((SELECT COUNT(*) FROM restaurants_categories) = 0) OR ((SELECT COUNT(*) FROM visited_restaurants) = 0);')" = "1" ]; then
  echo "entrypoint: seeding database..."
  bash /db/init.sh
fi

exec /work/app
