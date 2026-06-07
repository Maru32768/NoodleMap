-- Current schema snapshot for sessions, generated from goose migrations.
-- Do not edit by hand. Run `npm run db:schema:dump` from the repository root.

CREATE TABLE sessions
(
    id           TEXT     NOT NULL PRIMARY KEY,
    user_id      TEXT     NOT NULL,
    token_hash   TEXT     NOT NULL UNIQUE,
    user_agent   TEXT     NULL,
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at   DATETIME NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users (id)
);

CREATE INDEX sessions_user_id_index ON sessions (user_id);
