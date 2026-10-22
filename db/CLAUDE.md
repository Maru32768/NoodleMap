# Database Guidelines

## Structure

`db/` contains SQL schemas, SQL queries, initialization scripts, and seed CSV data.

Keep schema changes, query changes, and seed data changes focused and reviewable.

## Encoding

All SQL, CSV, and Markdown files are UTF-8. Be especially careful with Japanese text in seed data. Do not rewrite files after reading them through a garbled terminal.

## UUID Text Case

Normalize UUID values to lowercase when importing seed CSV data or writing data migrations. Seed CSVs may contain uppercase IDs, but SQLite stores UUIDs as `TEXT` and compares them case-sensitively; the API emits lowercase UUID strings, so uppercase stored IDs can cause `UPDATE ... WHERE id = ?` to affect zero rows without an SQL error.

## Schema and Queries

Schema migrations and queries live in `server/` (see `server/CLAUDE.md`): goose-format migrations in `src/main/resources/db/migrations/`, and SQLDelight `.sq` files in `src/main/sqldelight/`, whose `CREATE TABLE`s show the current table structure. `MigrationsTest` keeps the two aligned.

`db/init.sh` seeds a local database from the CSVs in `db/data/`. Start `server` once first so its migrations create the schema.

## Testing

For database-facing behavior, prefer focused `server` tests against a real migrated SQLite database. Call out migrations, seed data changes, or data compatibility concerns in PR notes.
