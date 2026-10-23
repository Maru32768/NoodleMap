import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const E2E_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const REPO_ROOT = resolve(E2E_DIR, "..");
export const DATA_DIR = resolve(E2E_DIR, ".data");
export const DB_PATH = resolve(DATA_DIR, "noodle_map.e2e.db");
export const WEB_BUILD_DIR = resolve(DATA_DIR, "web-build");
export const ADMIN_STATE = resolve(DATA_DIR, "admin.storage-state.json");

// Not the dev server's 8888, so e2e runs while `mise run dev` is up. Override to run
// several checkouts at once; the web preview proxies /api to BACKEND_PORT.
export const BACKEND_PORT = Number(process.env.E2E_BACKEND_PORT || 18888);
export const WEB_PORT = Number(process.env.E2E_WEB_PORT || 14180);
export const BASE_URL = `http://localhost:${WEB_PORT}`;

export const ADMIN_EMAIL = "e2e-admin@example.test";
export const SESSION_COOKIE = "noodle_map_session";
