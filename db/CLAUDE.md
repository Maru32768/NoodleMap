# Database Guidelines

## Structure

`db/` contains SQL schemas, SQL queries, initialization scripts, and seed CSV data.

Keep schema changes, query changes, and seed data changes focused and reviewable.

## Encoding

All SQL, CSV, and Markdown files are UTF-8. Be especially careful with Japanese text in seed data. Do not rewrite files after reading them through a garbled terminal.

## Generated Database Code

If SQL query or schema changes affect generated Go database code, regenerate the relevant code using the repository's established sqlc workflow and commit the generated output.

## Testing

For database-facing behavior, prefer focused Go tests in the server package that consumes the query. Call out migrations, seed data changes, or data compatibility concerns in PR notes.
