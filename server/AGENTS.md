# Server (Kotlin) Guidelines

`server/` is the API server, a Kotlin/Ktor rewrite of the former Go server (history in
`../MIGRATION.md`).

## Stack

- **Ktor** (Netty), kotlinx.serialization JSON.
- **SQLDelight** over `sqlite-jdbc` (Hikari pool). Schema/queries in `src/main/sqldelight/`.
- **Fabrikt** generates models + Ktor server interfaces from `../api/openapi.yaml`.
- Build: Gradle Kotlin DSL, JDK 21. Tests: JUnit 5 + Kotest assertions + `testApplication`.

## Commands (JDK 21 required)

- `./gradlew run` — start the server (env: `DB_PATH`, `SERVER_PORT`, `GOOGLE_OAUTH_CLIENT_ID`, …).
- `./gradlew build` — compile + tests + fat jar (`build/libs/*-all.jar`).
- `./gradlew fabriktGenerate` — regenerate API models/interfaces after the OpenAPI changes.
- `./gradlew test` — run tests; add `jacocoTestReport` for coverage in `build/reports/jacoco/test/`.

## Tests

- No mocks or fake app classes. Tests use a real migrated SQLite file and the real app via
  the `testApp`/`withTestDb` fixture in `src/test/kotlin/.../TestApp.kt`.
- Authenticate by seeding a user and session row (`seedSession`, `adminToken`, `userToken`) and
  sending the token as the session cookie. Google sign-in success is not testable offline.

## Generated code

- **Do not edit** `src/generated/kotlin/**` (Fabrikt output, committed). Change
  `../typespec/main.tsp`, run the repo `api:generate`, then `./gradlew fabriktGenerate`.
- SQLDelight code is generated into `build/` from the `.sq` files — edit the `.sq`, not the output.

## Schema changes

- The real schema comes from the goose-format SQL files in `src/main/resources/db/migrations/`.
  They are applied at startup by `db/Migrations.kt` and tracked in `goose_db_version`.
- To change the schema:
  1. Add the next numbered file, e.g. `00010_add_visit_logs.sql`, with a `-- +goose Up`
     section. Wrap triggers and other multi-statement bodies in `StatementBegin`/`StatementEnd`.
  2. Mirror the change in the matching `.sq` `CREATE TABLE`. The `.sq` files are only
     SQLDelight's compile-time schema; it can't parse the modtime triggers.
  3. Run `./gradlew test`. `MigrationsTest` fails if the `.sq` columns or indexes drift from the migrated schema.
- Never edit a migration once it is on `master`: a deployed database may already have applied it.

## Conventions

- Errors: throw `DomainException` subtypes (each owns its status/type/fieldErrors); rendered
  centrally by `installStatusPages`. Don't leak internal exception strings.
- Auth: enforce per-handler via `SessionService.requireUser`/`requireAdmin`. Sessions are
  opaque tokens hashed in the DB — never JWT sessions. Don't install ForwardedHeaders (trust no proxy).
- Store UUIDs as lowercase text (`UuidAdapter`).
- Keep handlers thin; put new code in the package of its domain (`auth`, `shops`, `visits`, `places`, `og`, `db`,
  `backup`, `jobs`), and shared plumbing in `common`, `errors` or `http`.

## After editing this file

Run `npm run sync-agents` from the repo root.
