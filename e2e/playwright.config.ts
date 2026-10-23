import { defineConfig, devices } from "@playwright/test";
import {
  ADMIN_EMAIL,
  ADMIN_STATE,
  BACKEND_PORT,
  BASE_URL,
  DB_PATH,
  REPO_ROOT,
  WEB_BUILD_DIR,
  WEB_PORT,
} from "./support/env.ts";

const webDir = `${REPO_ROOT}/web`;

export default defineConfig({
  testDir: "./tests",
  // All tests share one backend database; seeded names are unique per test, and
  // the tag list is replaced wholesale by PUT /api/v1/auth/tags, so run serially.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    // A service worker (vite-plugin-pwa) would bypass page.route interception.
    serviceWorkers: "block",
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "guest",
      testMatch: /guest\/.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
    {
      name: "guest-mobile",
      testMatch: /mobile\/.*\.spec\.ts/,
      use: { ...devices["Pixel 7"] },
      dependencies: ["setup"],
    },
    {
      name: "admin",
      testMatch: /admin\/.*\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: ADMIN_STATE,
      },
      dependencies: ["setup"],
    },
  ],
  webServer: [
    {
      name: "server",
      command: "node start-server.mjs",
      url: `http://localhost:${BACKEND_PORT}/health`,
      // Never attach to a developer's server: tests write shops and sessions.
      reuseExistingServer: false,
      timeout: 240_000,
      env: {
        DB_PATH,
        SERVER_PORT: String(BACKEND_PORT),
        GOOGLE_OAUTH_CLIENT_ID: "e2e-google-client-id",
        ADMIN_EMAIL,
        AUTH_COOKIE_SECURE: "false",
        BACKUP_PATH: `${DB_PATH}.bak`,
        S3_BUCKET: "",
        // No Places key: the add form's Google Place search shows its manual-entry fallback.
        GOOGLE_PLACES_API_KEY: "",
        // An http site without VISIT_IMAGES_R2_*: visit images are stored on local disk and
        // served under /api, which the web server proxies, so their URLs are on BASE_URL.
        PUBLIC_BASE_URL: BASE_URL,
      },
    },
    {
      name: "web",
      // A production build avoids Vite dev-server dependency re-optimization
      // reloads and vite-plugin-checker overlays; preview reuses server.proxy.
      command: `npx vite build --outDir "${WEB_BUILD_DIR}" --emptyOutDir --logLevel warn && npx vite preview --outDir "${WEB_BUILD_DIR}" --port ${WEB_PORT} --strictPort`,
      cwd: webDir,
      url: BASE_URL,
      reuseExistingServer: false,
      timeout: 240_000,
      env: {
        // Override web/.env so the build never talks to Google or the tile CDN.
        // A blank PMTiles URL selects the offline background-only basemap.
        VITE_BASEMAP_PMTILES_URL: " ",
        VITE_GOOGLE_OAUTH_CLIENT_ID: "e2e-google-client-id",
      },
    },
  ],
});
