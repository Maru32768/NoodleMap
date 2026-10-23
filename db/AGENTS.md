# Database Guidelines

## Structure

`db/` contains the source seed CSVs in `data/`, the committed `default.db` template, and `generate_default.py`. The schema and queries live in `server/` (see Schema and Queries below).

Keep seed data changes focused and reviewable.

## Encoding

All SQL, CSV, and Markdown files are UTF-8. Be especially careful with Japanese text in seed data. Do not rewrite files after reading them through a garbled terminal.

## UUID Text Case

Normalize UUID values to lowercase when importing seed CSV data or writing data migrations. Seed CSVs may contain uppercase IDs, but SQLite stores UUIDs as `TEXT` and compares them case-sensitively; the API emits lowercase UUID strings, so uppercase stored IDs can cause `UPDATE ... WHERE id = ?` to affect zero rows without an SQL error.

## Schema and Queries

Schema migrations and queries live in `server/` (see `server/CLAUDE.md`): goose-format migrations in `src/main/resources/db/migrations/`, and SQLDelight `.sq` files in `src/main/sqldelight/`, whose `CREATE TABLE`s show the current table structure. `MigrationsTest` keeps the two aligned.

Local Gradle `run` and Docker Compose copy `db/default.db` only when the destination database does not exist. Existing files are never replaced. Other launch methods seed only when `DB_SEED_PATH` is configured.

Run `python3 db/generate_default.py` from the repository root with JDK 21 to regenerate `db/default.db` after CSV or migration changes. The generator creates a fresh database using the server's migration runner, imports CSVs, validates integrity and foreign keys, and replaces only the template. Never generate it by copying a live database. Commit CSV changes with the regenerated template; do not commit WAL sidecars or authentication data.

## Testing

For database-facing behavior, prefer focused `server` tests against a real migrated SQLite database. Call out migrations, seed data changes, or data compatibility concerns in PR notes.
