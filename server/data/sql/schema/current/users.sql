-- Current schema snapshot for users, generated from goose migrations.
-- Do not edit by hand. Run `npm run db:schema:dump` from the repository root.

CREATE TABLE users
(
    id         TEXT     NOT NULL PRIMARY KEY,
    email      TEXT     NOT NULL UNIQUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    google_sub TEXT);

CREATE UNIQUE INDEX users_google_sub_unique ON users (google_sub);

CREATE TRIGGER update_users_modtime
    AFTER UPDATE ON users
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
