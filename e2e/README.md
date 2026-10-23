# End-to-end tests

Playwright tests that drive the real stack: the Kotlin backend (`server`) and a
production build of the frontend (`web`). Nothing in the app's API is mocked.

## Running

Requires JDK 21 on `PATH` and the Node version pinned in the root `.mise.toml`.

```sh
cd e2e
mise exec -- npm install
mise exec -- npx playwright install chromium   # first time only
mise exec -- npm test        # headless run
mise exec -- npm run test:ui # Playwright UI mode
mise exec -- npm run report  # open the last HTML report
```

Ports 18888 (backend) and 14180 (frontend) must be free. They differ from the dev
server's 8888, so the suite runs while `mise run dev` is up. To run several
checkouts at once, give each its own ports:

```sh
E2E_BACKEND_PORT=28888 E2E_WEB_PORT=24180 mise exec -- npm test
```

The suite never reuses a server that is already running, because tests write
shops, tags and sessions.

## What `npm test` starts

`playwright.config.ts` launches two web servers:

- `server`: `start-server.mjs` deletes the E2E database under `.data/`, runs
  `gradlew buildFatJar` (a no-op when the jar is current), and runs the jar on
  the backend port with an E2E `ADMIN_EMAIL` and a local-only backup path.
- `web`: `vite build` into `.data/web-build`, then `vite preview` on the web port.
  Preview reuses the dev proxy, and `API_PROXY_TARGET` points it at the E2E
  backend, so `/api` never reaches the dev server. A production build
  avoids dev-server dependency re-optimization reloads and the type-checker
  overlay. The build overrides `web/.env` so it never talks to Google or the
  tile CDN; the map renders the offline background-only style.

Each test also blocks every request to a host other than `localhost`.

## How login works without Google

Google Sign-In cannot be automated. The `setup` project (`tests/auth.setup.ts`)
waits for the backend to migrate the database, then uses `node:sqlite`
(`support/db.ts`) to insert the admin user and a session row exactly as
`server` does after a real sign-in: the cookie holds a random token and the
`sessions.token_hash` column holds its lowercase hex SHA-256. It checks the
session with `GET /api/v1/auth/me` and saves the cookie to
`.data/admin.storage-state.json`.

The `admin` project loads that storage state. The `guest` and `guest-mobile`
projects start signed out. The `api` fixture seeds and reads data through the
backend HTTP API with the admin cookie.

The E2E backend has no `GOOGLE_PLACES_API_KEY`, so the add form's Google Place
search shows its "not available" fallback once you type; tests that need results
stub the backend `/api/v1/auth/google-places/*` endpoints with `page.route`.

## Writing tests

- Seed what a test needs through the `api` fixture, and namespace names with
  `uid()` so tests don't see each other's data.
- Tests run on one worker against one database. `PUT /api/v1/auth/tags`
  replaces the whole tag list, so parallel workers would race.
- Prefer `getByRole` / `getByText` with the Japanese UI copy.
