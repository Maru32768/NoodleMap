# Repository Guidelines

## Project Structure

This repository contains a full-stack noodle map application.

- `web/`: React + TypeScript frontend built with Vite.
- `server/`: Kotlin/Ktor API server.
- `typespec/`: TypeSpec API contract source.
- `api/openapi.yaml`: generated OpenAPI document.
- `e2e/`: Playwright end-to-end tests against the real backend and frontend.
- `db/`: seed CSV data and the script that loads it. The schema and queries live in `server/`.
- `render.yaml`: Render Blueprint for deployed services and non-secret environment variables.

Directory-specific guidance lives in nested `CLAUDE.md` / `AGENTS.md` files. When working inside a directory, follow the closest nested guidance in addition to this root file.

## Build, Test, and Development Commands

Frontend commands run from `web/`:

- `npm run dev`: start the Vite development server.
- `npm run build`: run mojibake checks, lint, TypeScript checks, and production build.
- `npm run lint`: run ESLint across the frontend.
- `npm run format`: format frontend files with Prettier.

Backend commands run from `server/` (JDK 21):

- `./gradlew run`: start the API server.
- `./gradlew test`: run all backend tests.

End-to-end commands run from `e2e/` (Playwright against the real `server` and a `web` production build; needs JDK 21 and free ports 18888 and 14180, overridable with `E2E_BACKEND_PORT` and `E2E_WEB_PORT`, so it can run alongside the dev server on 8888):

- `npm test`: build and start both servers, then run the suite headless.
- `npm run test:ui`: run the suite in Playwright UI mode.
- `npm run report`: open the last HTML report.

API generation commands run from the repository root:

- `npm run api:generate`: regenerate OpenAPI, frontend TypeScript API types, and backend Kotlin API bindings.
- `npm run api:check`: verify TypeSpec and generated frontend API types are current.

Use `docker-compose.yml` at the repository root for local container orchestration when database services are needed.

[jev-lint](https://github.com/mizchi/jev-lint) asks a model whether code contradicts its own names, comments, and tests (`.jev-lint.yaml`; the Kotlin rules are ported in `.jev-lint/rules/kotlin/`). It sends the judged code to the TypeSafe API, so run it only when the user asks. `.mise.toml` pins it (`mise install`), and the key goes in `mise.local.toml`, which Git ignores, as `[env]` `TYPESAFE_API_KEY = "..."`. Run it through mise from the repository root, since a non-interactive shell may not have mise activated:

- `mise run jev-review [base]`: judge the lines changed since `base` (`origin/master` by default).
- `mise exec -- jev-lint check`: judge every configured file; `--dry-run` lists the subjects and the price without a request.

Its findings are candidates to judge, not errors: about one in five is wrong. After changing a Kotlin rule or its fixtures, refit with `mise exec -- jev-lint eval .jev-lint/rules/kotlin/<rule> --repeat 3` and accept with `--accept`; the reasoning behind each cutoff is in its `rule.yml`. On Windows, `eval --replay` and `--accept-last` mis-score these suites, because jev-lint compares a baseline's `/` paths with the `\` paths of the labels; a fresh `eval` scores them correctly.

## Generated Code

Keep `typespec/main.tsp` as the source of truth for API request and response shapes. Generated files are committed for reviewability:

- `api/openapi.yaml`
- `web/src/generated/api.ts`
- `server/src/generated/kotlin/**`

Do not edit generated files directly. Change TypeSpec first, then run `npm run api:generate`.

## Japanese Text and Encoding Safety

All source, Markdown, SQL, and config files are UTF-8. Do not rewrite Japanese text after reading it through a garbled terminal or non-UTF-8 shell output. If Japanese UI copy appears as mojibake such as `繧`, `縺`, `繝`, or `�`, stop and reopen the file explicitly as UTF-8 before editing.

When editing files that contain Japanese text, prefer patch-based edits that only touch the intended lines. Before finishing frontend text changes, run `npm run check:mojibake` from `web/`.

## UUID Text Case

Store UUID strings in lowercase in SQLite and seed/import paths. The backend serializes UUIDs as lowercase strings, while SQLite `TEXT` comparisons are case-sensitive by default; uppercase UUIDs in seed CSVs can make updates match zero rows without raising an SQL error.

## Agent Guidelines Files

`CLAUDE.md` files are the source of truth. Matching `AGENTS.md` files are generated copies for other agents.

After editing any `CLAUDE.md`, run `npm run sync-agents` from the repository root. Do not edit `AGENTS.md` files directly.

Current guideline files:

- `CLAUDE.md` -> `AGENTS.md`
- `web/CLAUDE.md` -> `web/AGENTS.md`
- `server/CLAUDE.md` -> `server/AGENTS.md`
- `typespec/CLAUDE.md` -> `typespec/AGENTS.md`
- `db/CLAUDE.md` -> `db/AGENTS.md`

## Commit and Pull Request Guidelines

Use Conventional Commits format for all non-WIP commits. `wip` is acceptable for local work-in-progress commits only and must not appear in shared branches or PRs.

Format: `<type>(<scope>): <imperative description>`

- Types: `feat`, `fix`, `chore`, `refactor`, `docs`, `test`
- Scope is optional but recommended, e.g. `feat(web):`, `fix(server):`
- Avoid short, non-descriptive messages such as `Fix import` or `fix`.

Pull requests should include a short summary, affected areas, verification commands run, and screenshots or screen recordings for UI changes. Link related issues and call out migrations, seed data changes, or new environment variables.

## Security and Configuration

Do not commit secrets or local environment files such as `.env` and `mise.local.toml`. Keep generated build output, local IDE files, and runtime logs out of commits unless explicitly required.

Non-secret Render values live in `render.yaml`. Secret values such as `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `GOOGLE_PLACES_API_KEY`, and `VITE_GOOGLE_OAUTH_CLIENT_ID` are configured outside the repository.
