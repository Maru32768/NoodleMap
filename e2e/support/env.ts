import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function port(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || value < 1 || value > 65535) {
    throw new Error(`${name} must be an integer port from 1 to 65535, got "${raw}"`);
  }
  return value;
}

// Not the dev server's 8888, so e2e runs while `mise run dev` is up. Override to run
// several at once; the web preview proxies /api to BACKEND_PORT.
export const BACKEND_PORT = port("E2E_BACKEND_PORT", 18888);
export const WEB_PORT = port("E2E_WEB_PORT", 14180);
if (BACKEND_PORT === WEB_PORT) {
  throw new Error(`E2E_BACKEND_PORT and E2E_WEB_PORT must differ, both are ${WEB_PORT}`);
}
export const BACKEND_URL = `http://localhost:${BACKEND_PORT}`;
export const BASE_URL = `http://localhost:${WEB_PORT}`;
// Tests block every request to another host, including other localhost ports.
export const WEB_HOST = new URL(BASE_URL).host;

export const E2E_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const REPO_ROOT = resolve(E2E_DIR, "..");
// Keyed by the ports so runs on different ports in one checkout don't wipe each other.
export const DATA_DIR = resolve(E2E_DIR, ".data", `${BACKEND_PORT}-${WEB_PORT}`);
export const DB_PATH = resolve(DATA_DIR, "noodle_map.e2e.db");
export const WEB_BUILD_DIR = resolve(DATA_DIR, "web-build");
// Gradle builds the e2e jar here, apart from server/build, which `./gradlew run` uses.
export const SERVER_BUILD_DIR = resolve(DATA_DIR, "server-build");
export const ADMIN_STATE = resolve(DATA_DIR, "admin.storage-state.json");

export const ADMIN_EMAIL = "e2e-admin@example.test";
export const SESSION_COOKIE = "noodle_map_session";
