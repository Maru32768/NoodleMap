#!/bin/sh
set -e

goose -dir /work/data/sql/migrations sqlite3 "$DB_PATH" up

if [ "$(sqlite3 "$DB_PATH" 'SELECT ((SELECT COUNT(*) FROM shops) = 0) OR ((SELECT COUNT(*) FROM visited_shops) = 0);')" = "1" ]; then
  echo "entrypoint: seeding database..."
  bash /db/init.sh
fi

exec /work/app
