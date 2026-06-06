# TypeSpec Guidelines

## Source of Truth

`typespec/main.tsp` is the source of truth for HTTP API shapes.

When changing routes, request payloads, response payloads, error bodies, or status codes, update TypeSpec first and run `npm run api:generate` from the repository root.

Generated files are:

- `api/openapi.yaml`
- `web/src/generated/api.ts`
- `server/api/api.gen.go`

Do not edit generated files by hand.

## Error Type Design

Use `type` as the stable machine-readable error discriminator. Prefer semantic snake_case strings such as `authentication_required` and `permission_denied`.

Endpoint-specific errors should be represented by endpoint-specific body models. Avoid using a broad shared `ErrorBody` in operation responses when the endpoint can expose a narrower set of errors.

For form-capable endpoints, model field errors explicitly:

- Define a field-name union for the request model, such as `AddRestaurantField`.
- Define a field error model using that field union and `FieldErrorType`.
- Use that endpoint-specific bad request body in the `400` response.

This lets the frontend distinguish field-level errors from toast/snackbar errors with generated types.

## Naming

- Error type values use lowercase snake_case.
- Field union values match JSON field names exactly.
- Request and response models use PascalCase.
- Reusable generic response wrappers are acceptable, but keep operation responses narrow enough for generated clients to be useful.

## Verification

Run from the repository root:

- `npm run api:generate` after changing API shapes.
- `npm run api:check` when only verifying TypeSpec and generated frontend API types.
