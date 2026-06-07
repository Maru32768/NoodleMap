# Database Guidelines

## Structure

`db/` contains SQL schemas, SQL queries, initialization scripts, and seed CSV data.

Keep schema changes, query changes, and seed data changes focused and reviewable.

## Encoding

All SQL, CSV, and Markdown files are UTF-8. Be especially careful with Japanese text in seed data. Do not rewrite files after reading them through a garbled terminal.

## Generated Database Code

If SQL query or schema changes affect generated Go database code, regenerate the relevant code using the repository's established sqlc workflow and commit the generated output.

## Current Schema Snapshot

`server/data/sql/schema/current/` contains read-only per-table snapshots of the schema after all goose migrations are applied. Migrations remain the source of database changes; the snapshots exist so the current table structure can be reviewed without replaying the full history mentally.

After adding or changing migrations, run `npm run db:schema:dump` from the repository root and commit the updated snapshots. Do not edit files under `current/` by hand.

## Testing

For database-facing behavior, prefer focused Go tests in the server package that consumes the query. Call out migrations, seed data changes, or data compatibility concerns in PR notes.
