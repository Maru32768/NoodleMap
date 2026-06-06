# Frontend Guidelines

## Structure

`web/` is a React + TypeScript frontend built with Vite.

- Source lives in `src/`.
- Pages live in `src/pages`.
- Feature modules live in `src/features`.
- Shared UI lives in `src/components`.
- Generated API types live in `src/generated/api.ts`.
- Global styling lives in `src/noodle-map.css`.

Keep feature-specific code under `src/features/<domain>/`. Use PascalCase for React components, camelCase for functions and variables, and kebab-case for route or CSS-oriented filenames where already established.

## Commands

Run these from `web/`:

- `npm run dev`: start the HTTPS Vite dev server.
- `npm run dev:http`: start the HTTP Vite dev server.
- `npm run build`: run mojibake checks, lint, TypeScript checks, and production build.
- `npm run lint`: run ESLint.
- `npm run format`: format with Prettier.
- `npm run check:mojibake`: check Japanese text for mojibake.

Use `volta run npm run build` if the ambient Node version is older than the version in `package.json`.

## API Client and Error Handling

API-facing types must come from `src/generated/api.ts`; do not hand-write copies of request or response shapes.

Use `openapi-fetch` through `src/utils/request.ts`:

- Use `apiClient.GET`, `apiClient.POST`, and `apiClient.PUT` with generated OpenAPI paths.
- Pass request bodies as typed objects, not `JSON.stringify`.
- Pass path parameters through `params.path`.
- Convert failed responses with `throwApiError`.
- Convert network failures with `withApiError`.

Do not reintroduce generic hand-written helpers such as `get<T>("/api/...")`; they lose the endpoint-to-operation type relationship.

API errors are typed by endpoint. Use the generated error body type and its `type` discriminator before deciding whether an error belongs in a field-level form error or a toast/snackbar.

Use the generic `Result<TData, TError>` from `src/utils/result.ts` for non-exception control flow.

Query fetchers may throw `ApiError` because SWR expects thrown errors. Mutation functions should prefer `ApiMutationResult<TData, TErrorBody>` instead of throwing, so endpoint-specific error body and `fieldErrors` types remain available to the caller. Use `ApiErrorBodyFor<TPath, TMethod>` to derive mutation error bodies from generated OpenAPI paths instead of hand-writing endpoint error unions.

For form-capable endpoints:

- If `error.type === "invalid_request"` and `fieldErrors` exists, map `fieldErrors[].field` to the matching input component.
- Otherwise surface the error through `toastApiError`.
- Field names must come from generated unions such as `AddRestaurantField` and `UpdateRestaurantField`.

User-facing error messages are managed in `src/utils/toast.ts`. Do not display backend English messages or raw `JSON.stringify(err)` output to users.

## React and UI

Use React function components and existing local UI components before adding new abstractions. Keep callbacks stable when they are passed to child components or hooks. Use SWR for client-side API data fetching where existing code does.

Japanese UI copy must stay UTF-8. Before finishing frontend text changes, run `npm run check:mojibake`.

## Verification

Before finishing frontend changes, run:

- `npm run build` from `web/`

For API type changes, run `npm run api:generate` from the repository root first.
