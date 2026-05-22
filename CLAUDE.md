# Repository Guidelines

## Project Structure & Module Organization

This repository contains a full-stack noodle map application.

- `web/`: React + TypeScript frontend built with Vite. Source lives in `web/src/`, with pages in `src/pages`, feature modules in `src/features`, shared UI in `src/components`, and global styling in `src/noodle-map.css`.
- `server/`: Go API server using Gin. Domain packages such as `restaurants`, `categories`, `auth`, `middleware`, and `infra` live directly under `server/`.
- `db/`: SQL schemas, queries, initialization scripts, and seed CSV data.
- `batch/` and `cmd/`: Go utilities for backup and restore workflows.
- `tools/`: auxiliary tooling, currently including a Gradle-based place-info fetch tool.
- `typespec/`: TypeSpec API contract source. `typespec/main.tsp` is the source of truth for HTTP API shapes.
- `api/openapi.yaml`: generated OpenAPI document. Regenerate it from TypeSpec; do not edit it by hand.
- `render.yaml`: Render Blueprint defining all services (frontend, backend, cron), the PostgreSQL database, and non-secret environment variables. Edit this file when adding or changing Render service configuration.

## Build, Test, and Development Commands

Frontend commands run from `web/`:

- `npm run dev`: start the Vite development server.
- `npm run build`: run TypeScript build checks and produce a production bundle.
- `npm run lint`: run ESLint across the frontend.
- `npm run format`: format frontend files with Prettier.
- `npm run preview`: serve the built frontend locally.

Backend commands run from `server/`:

- `go run .`: start the API server.
- `go test ./...`: run all Go tests.
- `go fmt ./...`: format Go code.

API generation commands run from the repository root:

- `npm run api:generate`: regenerate OpenAPI, frontend TypeScript API types, and backend Go API bindings.
- `npm run api:check`: verify TypeSpec and generated frontend API types are current.

Use `docker-compose.yml` at the repository root for local container orchestration when database services are needed.

## API Contract & Generated Code

Keep `typespec/main.tsp` as the source of truth for API request and response shapes. When changing API routes, payloads, or response models, update TypeSpec first and run `npm run api:generate`.

Generated files are committed for reviewability:

- `api/openapi.yaml`
- `web/src/generated/api.ts`
- `server/api/api.gen.go`

Do not edit generated files directly. Frontend API-facing types should come from `web/src/generated/api.ts`. Backend routing should stay wired through the generated `server/api` bindings, with hand-written adapters delegating to domain packages.

## Coding Style & Naming Conventions

Frontend code uses TypeScript, React function components, ES modules, ESLint, and Prettier. Keep feature-specific code under `web/src/features/<domain>/`. Use PascalCase for React components, camelCase for functions and variables, and kebab-case for route or CSS-oriented filenames where already established.

Go code should be formatted with `go fmt`. Keep packages small and domain-oriented, matching existing directories such as `restaurants` and `categories`.

## Japanese Text & Encoding Safety

All source, Markdown, SQL, and config files are UTF-8. Do not rewrite Japanese text after reading it through a garbled terminal or non-UTF-8 shell output. If Japanese UI copy appears as mojibake such as `繧`, `縺`, `繝`, or `�`, stop and reopen the file explicitly as UTF-8 before editing.

When editing files that contain Japanese text, prefer patch-based edits that only touch the intended lines. Do not use shell commands such as PowerShell `Set-Content`, `Out-File`, or ad-hoc scripts unless they explicitly read and write UTF-8. Before finishing frontend text changes, run `npm run check:mojibake` from `web/`.

## Testing Guidelines

There is no dedicated frontend test script currently; before submitting frontend changes, run `npm run format` then `npm run build` from `web/`. `npm run build` includes lint and mojibake checks. For Go changes, add or update tests near the package being changed and run `go test ./...`.

Prefer focused tests for request handlers, service logic, and database-facing behavior. Name Go test files `*_test.go`.

## Agent Guidelines Files

`AGENTS.md` is kept in sync with this file. After editing `CLAUDE.md`, run `npm run sync-agents` from `web/` to propagate changes to `AGENTS.md`. Do not edit `AGENTS.md` directly.

## Commit & Pull Request Guidelines

Use Conventional Commits format for all non-WIP commits. `wip` is acceptable for local work-in-progress commits only and must not appear in shared branches or PRs. Never use short, non-descriptive messages such as `Fix import` or `fix`.

Format: `<type>(<scope>): <imperative description>`

- Types: `feat`, `fix`, `chore`, `refactor`, `docs`, `test`
- Scope is optional but recommended for clarity, e.g. `feat(web):`, `fix(server):`
- Description must be imperative and meaningful, e.g. `feat(web): add sidebar search filter`

Pull requests should include a short summary, affected areas (`web`, `server`, `db`, etc.), verification commands run, and screenshots or screen recordings for UI changes. Link related issues when available and call out migrations, seed data changes, or new environment variables.

## Security & Configuration Tips

Do not commit secrets or local environment files. The frontend expects values such as `VITE_GOOGLE_API_KEY` from the environment. Keep generated build output, local IDE files, and runtime logs out of commits unless explicitly required.

Non-secret environment variables (region names, bucket names, ports) are declared directly in `render.yaml`. Secret values (`TOKEN_SECRET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `VITE_GOOGLE_API_KEY`) are marked `sync: false` and must be set manually in the Render dashboard.
