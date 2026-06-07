# Server Guidelines

## Structure

`server/` is a Go API server using Gin.

- Domain packages live directly under `server/`, such as `restaurants`, `auth`, `middleware`, and `infra`.
- Generated API bindings live in `server/api/api.gen.go`.
- Hand-written adapters in `server/api` delegate to domain packages.

Keep packages small and domain-oriented. Format all Go changes with `go fmt`.

## Commands

Run these from `server/`:

- `go run .`: start the API server.
- `go test ./...`: run all Go tests.
- `go fmt ./...`: format Go code.

## API Contract and Generated Bindings

Do not edit `server/api/api.gen.go` directly. Change `typespec/main.tsp` and run `npm run api:generate` from the repository root.

Backend routing should stay wired through the generated `server/api` bindings. Domain handlers should remain hand-written and should not duplicate generated request or response structs unless there is a local domain model reason.

## Error Responses

Use `server/httperrors` for API error responses.

- Use typed `type` values such as `invalid_request`, `authentication_required`, `permission_denied`, and `internal_error`.
- Use `BadRequestWithFieldErrors` when validation errors should map to specific frontend form fields.
- Field error names must match the corresponding TypeSpec field unions so frontend form handling remains type-safe.
- Do not expose internal Go error strings to users. Log internal details separately and return typed public error bodies.

Permission failures should return `403 permission_denied`, not a generic `500`.

## Testing

Add or update focused tests near the package being changed for handler behavior, service logic, and database-facing behavior. Name Go test files `*_test.go`.

Run `go test ./...` before finishing server changes.
