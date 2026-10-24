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
server's 8888, so the suite runs while `mise run dev` is up. To run several at
once, in one checkout or in several, give each run its own ports:

```sh
E2E_BACKEND_PORT=28888 E2E_WEB_PORT=24180 mise exec -- npm test
```

```powershell
$env:E2E_BACKEND_PORT=28888; $env:E2E_WEB_PORT=24180; mise exec -- npm test
```

The ports must be different integers from 1 to 65535. Everything a run writes
(database, visit images, web and server builds, storage state, test results)
lives under `.data/<backend port>-<web port>/`, so runs on different ports don't
wipe each other; two runs on the same ports would.

The suite never reuses a server that is already running, because tests write
shops, tags and sessions.

A run fails after 15 minutes (`globalTimeout`, which includes building and
starting the servers) instead of hanging. Set `E2E_GLOBAL_TIMEOUT_MINUTES` (0 to
1440) to change it. Long runs such as `--repeat-each`, headed debugging with
`page.pause()`, or an `E2E_WEB_DEV=1` run can exceed it; set
`E2E_GLOBAL_TIMEOUT_MINUTES=0` to disable it for those.

To keep only the end of the output, prefer redirecting it to a file over piping
it into `tail` or `Select-Object -Last`:

```sh
mise exec -- npm test > e2e.log 2>&1
```

```powershell
# cmd's redirection keeps the bytes as UTF-8; Windows PowerShell's `>` re-encodes them.
cmd /c "mise exec -- npm test > e2e.log 2>&1"
```

Piping works too, but a pipe only closes once every process holding it exits, so a
process that outlives the run with an inherited handle (such as a Gradle daemon)
would keep it open. `start-server.mjs` avoids that; see below.

## What `npm test` starts

`playwright.config.ts` launches two web servers:

- `server`: `start-server.mjs` deletes the E2E database under `.data/<ports>/`,
  runs `gradlew buildFatJar` (a no-op when the jar is current) into
  `.data/<ports>/server-build` rather than `server/build`, so a `./gradlew run`
  dev server in the same checkout keeps its classes, and runs the jar on the
  backend port with an E2E `ADMIN_EMAIL` and a local-only backup path.
  On Windows every child process inherits the caller's stdout handle, so a Gradle
  or Kotlin daemon left running would keep `npm test | tail` open after Playwright
  exits. There the build runs with `--no-daemon`, in-process Kotlin compilation and
  `-Xmx1g -XX:MaxMetaspaceSize=512m` in a single-use JVM. Measured on one Windows
  machine: about 15 s when the jar is up to date (about 4 s with a warm daemon),
  and about 60 s after editing one Kotlin file (still incremental compilation, but
  in a cold JVM).
- `web`: `vite build` into `.data/<ports>/web-build`, then `vite preview` on the
  web port. Preview reuses the dev proxy, and `API_PROXY_TARGET` points it at the E2E
  backend, so `/api` never reaches the dev server. A production build
  avoids dev-server dependency re-optimization reloads and the type-checker
  overlay. The build overrides `web/.env` so it never talks to Google or the
  tile CDN; the map renders the offline background-only style.

Each test also blocks every request to a host other than the web preview's
`localhost:<web port>`. A test fails if its page (or a guest page from the
`asGuest` fixture) throws an uncaught error or logs one that `AppErrorBoundary`
caught.

Set `E2E_WEB_DEV=1` to serve `web` with the Vite dev server instead. The dev build
renders under React StrictMode, so it catches bugs the production build hides,
such as effects that break when run twice on mount. It is for reproducing such
bugs, not for CI: first loads are slow, Vite may reload the page when it
re-optimizes dependencies mid-run, and a type or lint error from
vite-plugin-checker shows as an overlay that blocks clicks.

## How login works without Google

Google Sign-In cannot be automated. The `setup` project (`tests/auth.setup.ts`)
waits for the backend to migrate the database, then uses `node:sqlite`
(`support/db.ts`) to insert the admin user and a session row exactly as
`server` does after a real sign-in: the cookie holds a random token and the
`sessions.token_hash` column holds its lowercase hex SHA-256. It checks the
session with `GET /api/v1/auth/me` and saves the cookie to
`.data/<ports>/admin.storage-state.json`.

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
