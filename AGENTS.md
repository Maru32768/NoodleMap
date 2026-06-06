# Repository Guidelines

## Project Structure

This repository contains a full-stack noodle map application.

- `web/`: React + TypeScript frontend built with Vite.
- `server/`: Go API server using Gin.
- `typespec/`: TypeSpec API contract source.
- `api/openapi.yaml`: generated OpenAPI document.
- `db/`: SQL schemas, queries, initialization scripts, and seed CSV data.
- `render.yaml`: Render Blueprint for deployed services and non-secret environment variables.

Directory-specific guidance lives in nested `CLAUDE.md` / `AGENTS.md` files. When working inside a directory, follow the closest nested guidance in addition to this root file.

## Build, Test, and Development Commands

Frontend commands run from `web/`:

- `npm run dev`: start the Vite development server.
- `npm run build`: run mojibake checks, lint, TypeScript checks, and production build.
- `npm run lint`: run ESLint across the frontend.
- `npm run format`: format frontend files with Prettier.

Backend commands run from `server/`:

- `go run .`: start the API server.
- `go test ./...`: run all Go tests.
- `go fmt ./...`: format Go code.

API generation commands run from the repository root:

- `npm run api:generate`: regenerate OpenAPI, frontend TypeScript API types, and backend Go API bindings.
- `npm run api:check`: verify TypeSpec and generated frontend API types are current.

Use `docker-compose.yml` at the repository root for local container orchestration when database services are needed.

## Generated Code

Keep `typespec/main.tsp` as the source of truth for API request and response shapes. Generated files are committed for reviewability:

- `api/openapi.yaml`
- `web/src/generated/api.ts`
- `server/api/api.gen.go`

Do not edit generated files directly. Change TypeSpec first, then run `npm run api:generate`.

## Japanese Text and Encoding Safety

All source, Markdown, SQL, and config files are UTF-8. Do not rewrite Japanese text after reading it through a garbled terminal or non-UTF-8 shell output. If Japanese UI copy appears as mojibake such as `繧`, `縺`, `繝`, or `�`, stop and reopen the file explicitly as UTF-8 before editing.

When editing files that contain Japanese text, prefer patch-based edits that only touch the intended lines. Before finishing frontend text changes, run `npm run check:mojibake` from `web/`.

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

Do not commit secrets or local environment files. Keep generated build output, local IDE files, and runtime logs out of commits unless explicitly required.

Non-secret Render values live in `render.yaml`. Secret values such as `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `VITE_GOOGLE_API_KEY`, and `VITE_GOOGLE_OAUTH_CLIENT_ID` are configured outside the repository.
