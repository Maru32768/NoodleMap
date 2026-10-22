import { createHash, randomBytes, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { DB_PATH } from "./env.ts";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// Mirrors the server SessionTime: UTC "yyyy-MM-dd HH:mm:ss", compared as text.
function sessionTime(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 19).replace("T", " ");
}

/**
 * Google Sign-In cannot be automated, so tests log in the way the server would
 * after a successful sign-in: upsert the user and insert a session whose
 * token_hash is the lowercase hex SHA-256 of the raw cookie token
 * (server SessionService/SessionTokens). Returns the raw token for the
 * `noodle_map_session` cookie. The server must have migrated the DB already.
 */
export function seedSession(email: string): string {
  const db = new DatabaseSync(DB_PATH);
  try {
    db.exec("PRAGMA busy_timeout = 5000");
    db.prepare(
      "INSERT INTO users (id, email, google_sub) VALUES (?, ?, ?) ON CONFLICT DO NOTHING",
    ).run(randomUUID(), email, `e2e-sub-${email}`);
    const user = db.prepare("SELECT id FROM users WHERE email = ?").get(email) as
      | { id: string }
      | undefined;
    if (!user) {
      throw new Error(`failed to seed user ${email}`);
    }

    const token = randomBytes(32).toString("base64url");
    db.prepare(
      "INSERT INTO sessions (id, user_id, token_hash, user_agent, expires_at) VALUES (?, ?, ?, ?, ?)",
    ).run(
      randomUUID(),
      user.id,
      createHash("sha256").update(token).digest("hex"),
      "playwright-e2e",
      sessionTime(Date.now() + SESSION_TTL_MS),
    );
    return token;
  } finally {
    db.close();
  }
}
