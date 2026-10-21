# Backend Migration: Go → Kotlin

Tracking document for rewriting the `server/` backend from Go (Gin) to Kotlin (Ktor).

## Motivation

Go's error-handling verbosity (`if err != nil`, repeated `switch errors.Is`) and weak
type system. **Success bar:** the result must be demonstrably less boilerplate and more
type-safe around errors and types than the Go it replaces. If a decision doesn't move us
toward that, it's not worth the churn.

## Decisions

| Area | Decision |
| --- | --- |
| Framework | **Ktor**. Errors via exceptions + `StatusPages`. |
| API contract | **TypeSpec stays source of truth.** `Fabrikt` generates kotlinx.serialization models (`ENFORCE_*` nullability on, sealed interfaces for `oneOf`) **and** Ktor server interfaces. Implementations hand-written. **Generated Kotlin is committed.** |
| Errors | Sealed `DomainException` hierarchy; **each error owns its `status` / `type` / `fieldErrors`**, rendered generically in `StatusPages`. Collapses the three Go `switch errors.Is` blocks into one. Malformed JSON → generic `invalid_request`. |
| Persistence | **SQLDelight** (the sqlc twin) over `sqlite-jdbc` (xerial). |
| SQLite access | **Mirror Go**: WAL + `busy_timeout=5000` + `foreign_keys=ON` via Hikari `connectionInitSql`; modest pool (max 4–8). Drop to pool max=1 if `SQLITE_BUSY` appears. |
| Migrations | **goose-format SQL files** in `server-kt/src/main/resources/db/migrations`, applied at startup by a small runner (`db/Migrations.kt`) that tracks them in goose's own `goose_db_version` table. The prod DB needs no reconciliation, and fresh DBs match prod exactly (modtime triggers included). Not SQLDelight `.sqm`, because SQLDelight's dialect can't parse the prod triggers. |
| Auth — sessions | Keep opaque-token-in-DB model via a **custom Ktor `Authentication` provider** (not Ktor's cookie-Sessions plugin — preserves server-side revocation). |
| Auth — Google | Replace the ~220-line hand-rolled JWKS/JWT verifier with **`google-auth-library`'s `GoogleIdTokenVerifier`** + explicit `email_verified` check. |
| Background jobs | **Coroutines** (`while + delay`) on the application scope. |
| S3/backup | **AWS SDK for Kotlin**. R2 swap (later) needs `requestChecksumCalculation` / `responseChecksumValidation = WHEN_REQUIRED`, custom endpoint, `region = "auto"`. |
| DI | Manual constructor wiring (compile-time safe). |
| Config | Typed `Config.fromEnv()`, fail-fast (mirrors `env.go`). No HOCON. |
| Logging | Logback + Ktor `CallLogging`. |
| Tests | JUnit 5 + Kotest assertions, `testApplication`, in-memory SQLite. |
| Build | Gradle Kotlin DSL, single module, domain-oriented packages. Fabrikt via Gradle task wired into `npm run api:generate`. |
| Runtime | Plain tuned JVM (`-XX:MaxRAMPercentage`). GraalVM native **out of scope**. |
| Cutover | **Big-bang** with a pre-cutover validation pass. |
| Hosting | **512 MB Render interim** (escape hatch: one-tier bump), then **Fly.io 1–2 GB as phase 2**. |

## Directory strategy

The Kotlin server is developed in **`server-kt/`** alongside the running Go `server/`.
At cutover, `server-kt/` replaces `server/` (or `render.yaml` `rootDir` is repointed).
This keeps the proven Go service intact and runnable for contract-parity diffing until
the swap.

- Root package: `dev.marulabs.noodlemap`
- Generated Fabrikt sources committed under `server-kt/src/generated/kotlin/src/main/kotlin/dev/marulabs/noodlemap/generated/`

## API surface (from `typespec/main.tsp`)

| Method | Route | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/api/v1/shops` | public | list shops |
| GET | `/api/v1/tags` | public | list tags |
| POST | `/api/v1/auth/google` | public | exchange Google credential → session cookie |
| POST | `/api/v1/auth/logout` | public | clear session |
| GET | `/api/v1/auth/me` | session | current user |
| PUT | `/api/v1/auth/tags` | admin | save tags |
| POST | `/api/v1/auth/shops` | admin | add shop |
| PUT | `/api/v1/auth/shops/{id}` | admin | update shop |

`requiresAuthentication` parity: everything under `/api/v1/auth/` **except** `/auth/google`
and `/auth/logout` requires a valid session. Admin gate (`isAdmin`) applies to
`saveTags`, `addShop`, `updateShop`.

## Parity checklist (must not regress)

- [ ] No proxy trust — do **not** install `ForwardedHeaders`/`XForwardedHeaders` (matches `SetTrustedProxies(nil)`).
- [ ] Session cookie `noodle_map_session`: `HttpOnly`, `SameSite=Lax`, `Secure` env-driven, `path=/`, 30-day max-age, sliding refresh throttled at 12 h.
- [ ] No-cache on every response: `Cache-Control: no-store`, `Pragma: no-cache`, `Expires: 0`.
- [ ] `GET /health` → `200 "ok"`.
- [ ] UUIDs stored lowercase (`UUID.toString()`); seed/import paths lowercase.
- [ ] `foreign_keys=ON` on every pooled connection.
- [ ] `User` JSON shape `{ id, email, isAdmin }`.
- [ ] Request-scoped user via call attributes (was gin context key `"user"`).
- [ ] No CORS today (same-origin via `/api/*` rewrite). **Revisit at Fly.io move** if frontend calls backend cross-origin.
- [ ] First-login race handling (concurrent insert on `google_sub` → fall back to existing row).
- [ ] `email_verified` rejection preserved.
- [ ] `ADMIN_EMAIL` empty → warn + continue (not fatal); other required env missing → refuse boot.

## Implementation plan (ordered)

1. **Scaffold** `server-kt/` — Gradle Kotlin DSL, Ktor, SQLDelight, Fabrikt, kotlinx.serialization, JUnit5/Kotest. Bootstrap Gradle wrapper.
2. **Persistence** — `.sq` schema from `server/data/sql/schema/current`, port sqlc queries, set up SQLDelight driver + Hikari + PRAGMAs.
3. **Core infra** — `Config.fromEnv`, sealed `DomainException` + `StatusPages`, `NoCache` plugin, logging.
4. **Auth** — Google verifier wrapper, session token utils, custom `Authentication` provider, handlers.
5. **Shops/tags** — port service logic + handlers, wire Fabrikt interfaces, DTO mapping.
6. **Background jobs** — backup (VACUUM INTO → gzip → S3) + session cleanup coroutines.
7. **Tests** — endpoint (`testApplication`), query layer (in-memory SQLite), auth.
8. **Pipeline + Docker** — Fabrikt task wired into `npm run api:generate`; Dockerfile; update `server-kt/CLAUDE.md`/`AGENTS.md` + `sync-agents`; retire `cmd/dump-schema`.

## Cutover checklist (big-bang)

1. Build and run `server-kt` against a **restored copy** of the prod DB.
2. ~~Reconcile `PRAGMA user_version`~~. No longer needed, because the Kotlin runner reads
   goose's `goose_db_version` directly. Verified: a prod copy boots as "up to date at migration 9".
3. Smoke-test all 8 endpoints; **diff responses against the Go server** (contract parity).
4. Verify cookie flags, no-cache headers, FK enforcement, lowercase UUIDs.
5. Confirm JVM stays within 512 MB on Render (escape hatch: one-tier bump).
6. Swap the Docker image / `render.yaml` `rootDir`. Keep Go image available for rollback.

## Phase 2 follow-ups (post-rewrite)

- S3 → Cloudflare R2 (checksum config noted above).
- Render → Fly.io 1–2 GB: `fly.toml`, persistent **volume** for SQLite (single machine), DB data move, CORS revisit, repoint frontend `/api/*` rewrite.
- Update `render.yaml`/hosting config; retire Go `server/`.

## Verification status

✅ **`server-kt` compiles, the smoke tests pass, and the fat jar builds** (Gradle 8.11.1,
JDK 21, Fabrikt plugin 1.36.0, SQLDelight 2.1.0). Commands:

```
cd server-kt
./gradlew fabriktGenerate   # regenerate models + Ktor interfaces from ../api/openapi.yaml
./gradlew build             # compile + smoke tests + fat jar (build/libs/*-all.jar)
./gradlew run               # run locally (needs DB_PATH, SERVER_PORT, GOOGLE_OAUTH_CLIENT_ID)
```

Smoke tests (`ApiSmokeTest`, via `testApplication` + temp-file SQLite) cover `/health`,
fresh-DB `shops`/`tags` reads, no-cache headers, and auth gating (401). `MigrationsTest`
covers fresh-DB migration, idempotent reruns, refusing a DB newer than the build, rollback
of a failed migration, the goose parser, and parity between the `.sq` schema and the
migrated schema.

Migration checks run by hand on 2026-10-22:

- A fresh DB migrated by Kotlin matches the goose-built prod DB on all 19 `sqlite_master` objects.
- The Go server boots on a Kotlin-migrated DB, so rolling back stays safe until the first Kotlin-only migration.

Memory on 2026-10-22, `docker run --memory=512m`, prod data copy, 3000 × `GET /api/v1/shops`
at 30 concurrent: Kotlin used 81 MB idle and 231 MB after load. Go used 7 MB and 15 MB.
Image or OGP processing load was not measured.

### Deviations / decisions made during implementation
- **Fabrikt plugin 1.36.0** (not the guessed 1.6.0); `serializationLibrary = Kotlinx` lives
  in the `model {}` block. Generated sources are committed under
  `src/generated/kotlin/src/main/kotlin/` (Fabrikt nests `src/main/kotlin`), registered as
  an extra source root.
- **The `.sq` files are a compile-time schema only.** SQLDelight 2.1's dialect rejects `NEW`
  in trigger bodies, so the modtime triggers can't be declared there. The real schema comes
  from the goose migrations, which include the triggers. `MigrationsTest` fails if the `.sq`
  columns or indexes drift from the migrated schema.
- **Docker build skips `fabriktGenerate`.** The Fabrikt plugin wires codegen into
  `compileKotlin`, but `../api` is outside the image's build context. Generated sources are committed.
- **Auth-vs-body ordering:** the generated route deserializes the request body before the
  handler's auth check, so a *malformed/body-less* write request can surface `415`/`400`
  before `401`. Real frontend requests (valid JSON) still get the correct `401`/`403`.
- **Datetimes:** sessions stored as UTC `yyyy-MM-dd HH:mm:ss` (lexically comparable; legacy
  Go-format rows still validate). Shop open/close dates decode via first-10-chars (works for
  both legacy JST-anchored rows and new writes). Verify against restored prod data at cutover.
- **JUnit pinned to 5.10.5** (+ junit-bom) to match Gradle 8.11's bundled platform launcher.
- **Gradle wrapper** generated and committed (`gradlew`, `gradle/wrapper/`).

### Contract-parity result ✅
Ran both servers against consistent copies of the prod DB (`db-data/noodle_map.db`:
1465 shops, 28 tags, 468 eaten_shops) and diffed:
- `GET /api/v1/shops` — **byte-identical** (1465, canonicalised by id incl. nested tags).
- `GET /api/v1/tags` — **byte-identical** (28).
- `GET /api/v1/auth/me` (no cookie) — both `401` with identical body
  `{"type":"authentication_required","message":"authentication required"}`.
- No-cache headers identical on all responses.

Auth-success / admin-write paths require a real Google credential, so they're covered by
the ported logic + smoke tests rather than the live diff — exercise them manually with a
real login during final validation.

### Cutover state
- `api:generate` now also regenerates the Kotlin bindings (`api:generate:server-kt` →
  `node scripts/gen-kt.mjs`, which runs the Gradle wrapper portably).
- Gradle daemon pinned to JDK 21 (`gradle/gradle-daemon-jvm.properties`), so codegen/build
  don't depend on the caller's `JAVA_HOME`.
- `server-kt/CLAUDE.md` added to `sync-agents`; `AGENTS.md` generated.
- **`render.yaml` `rootDir` flipped to `server-kt`** — ⚠️ pushing to `master` deploys the
  Kotlin server. Roll back by reverting `rootDir` to `server` (the Go server is untouched).
- Still recommended before/at the push: verify `openedAt`/`closedAt` against any prod rows
  that have them, and do one real Google login end-to-end against a staging copy.
</content>
</invoke>
