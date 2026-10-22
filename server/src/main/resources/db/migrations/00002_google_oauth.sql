-- +goose Up

ALTER TABLE users ADD COLUMN google_sub TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub_unique ON users (google_sub);

DROP TRIGGER IF EXISTS update_user_tokens_modtime;
DROP TABLE IF EXISTS user_tokens;
DROP TABLE IF EXISTS temporary_users;

-- Password-era accounts cannot be linked by email under Google auth (a Google
-- first-login inserts a fresh row keyed by google_sub and would collide on the
-- UNIQUE email constraint). No password user should survive the cutover, so drop
-- the legacy rows; they re-register transparently on first Google sign-in.
DELETE FROM users;

ALTER TABLE users DROP COLUMN password;
ALTER TABLE users DROP COLUMN salt;
ALTER TABLE users DROP COLUMN is_admin;

CREATE TABLE IF NOT EXISTS sessions
(
    id           TEXT     NOT NULL PRIMARY KEY,
    user_id      TEXT     NOT NULL,
    token_hash   TEXT     NOT NULL UNIQUE,
    user_agent   TEXT     NULL,
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at   DATETIME NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users (id)
);

CREATE INDEX IF NOT EXISTS sessions_user_id_index ON sessions (user_id);

-- +goose Down

DROP INDEX IF EXISTS sessions_user_id_index;
DROP TABLE IF EXISTS sessions;

ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN password TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN salt TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS user_tokens
(
    id         TEXT     NOT NULL PRIMARY KEY,
    user_id    TEXT     NOT NULL UNIQUE,
    token      TEXT     NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
);

-- +goose StatementBegin
CREATE TRIGGER IF NOT EXISTS update_user_tokens_modtime
    AFTER UPDATE ON user_tokens
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE user_tokens SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
-- +goose StatementEnd

CREATE TABLE IF NOT EXISTS temporary_users
(
    id         TEXT     NOT NULL PRIMARY KEY,
    email      TEXT     NOT NULL,
    token      TEXT     NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DROP INDEX IF EXISTS users_google_sub_unique;
ALTER TABLE users DROP COLUMN google_sub;
