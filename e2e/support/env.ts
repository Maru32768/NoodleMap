import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const E2E_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const REPO_ROOT = resolve(E2E_DIR, "..");
export const DATA_DIR = resolve(E2E_DIR, ".data");
export const DB_PATH = resolve(DATA_DIR, "noodle_map.e2e.db");
export const WEB_BUILD_DIR = resolve(DATA_DIR, "web-build");
export const ADMIN_STATE = resolve(DATA_DIR, "admin.storage-state.json");

// The Vite proxy in web/vite.config.ts hardcodes this backend port for /api.
export const BACKEND_PORT = 8888;
export const WEB_PORT = 4180;
export const BASE_URL = `http://localhost:${WEB_PORT}`;

export const ADMIN_EMAIL = "e2e-admin@example.test";
export const SESSION_COOKIE = "noodle_map_session";
