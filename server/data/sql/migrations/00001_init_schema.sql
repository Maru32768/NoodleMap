-- +goose Up

CREATE TABLE IF NOT EXISTS categories
(
    id         TEXT     NOT NULL PRIMARY KEY,
    label      TEXT     NOT NULL,
    icon       TEXT     NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- +goose StatementBegin
CREATE TRIGGER IF NOT EXISTS update_categories_modtime
    AFTER UPDATE ON categories
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE categories SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
-- +goose StatementEnd

CREATE TABLE IF NOT EXISTS users
(
    id         TEXT     NOT NULL PRIMARY KEY,
    email      TEXT     NOT NULL UNIQUE,
    password   TEXT     NOT NULL,
    salt       TEXT     NOT NULL,
    is_admin   BOOLEAN  NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- +goose StatementBegin
CREATE TRIGGER IF NOT EXISTS update_users_modtime
    AFTER UPDATE ON users
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
-- +goose StatementEnd

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

CREATE TABLE IF NOT EXISTS restaurants
(
    id              TEXT     NOT NULL PRIMARY KEY,
    name            TEXT     NOT NULL,
    lat             REAL     NOT NULL,
    lng             REAL     NOT NULL,
    postal_code     TEXT     NOT NULL,
    address         TEXT     NOT NULL,
    google_place_id TEXT     NOT NULL UNIQUE,
    closed          BOOLEAN  NOT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- +goose StatementBegin
CREATE TRIGGER IF NOT EXISTS update_restaurants_modtime
    AFTER UPDATE ON restaurants
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE restaurants SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
-- +goose StatementEnd

CREATE TABLE IF NOT EXISTS visited_restaurants
(
    id            TEXT     NOT NULL PRIMARY KEY,
    restaurant_id TEXT     NOT NULL UNIQUE,
    rate          REAL     NOT NULL,
    favorite      BOOLEAN  NOT NULL,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (restaurant_id) REFERENCES restaurants (id)
);

-- +goose StatementBegin
CREATE TRIGGER IF NOT EXISTS update_visited_restaurants_modtime
    AFTER UPDATE ON visited_restaurants
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE visited_restaurants SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
-- +goose StatementEnd

CREATE TABLE IF NOT EXISTS restaurants_categories
(
    id            TEXT     NOT NULL PRIMARY KEY,
    restaurant_id TEXT     NOT NULL,
    category_id   TEXT     NOT NULL,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (restaurant_id) REFERENCES restaurants (id),
    FOREIGN KEY (category_id) REFERENCES categories (id)
);

-- +goose StatementBegin
CREATE TRIGGER IF NOT EXISTS update_restaurants_categories_modtime
    AFTER UPDATE ON restaurants_categories
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE restaurants_categories SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
-- +goose StatementEnd

CREATE TABLE IF NOT EXISTS restaurant_images
(
    id            TEXT     NOT NULL PRIMARY KEY,
    restaurant_id TEXT     NOT NULL,
    path          TEXT     NOT NULL,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (restaurant_id) REFERENCES restaurants (id)
);

-- +goose StatementBegin
CREATE TRIGGER IF NOT EXISTS update_restaurant_images_modtime
    AFTER UPDATE ON restaurant_images
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE restaurant_images SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
-- +goose StatementEnd

-- +goose Down

DROP TRIGGER IF EXISTS update_restaurant_images_modtime;
DROP TABLE IF EXISTS restaurant_images;

DROP TRIGGER IF EXISTS update_restaurants_categories_modtime;
DROP TABLE IF EXISTS restaurants_categories;

DROP TRIGGER IF EXISTS update_visited_restaurants_modtime;
DROP TABLE IF EXISTS visited_restaurants;

DROP TRIGGER IF EXISTS update_restaurants_modtime;
DROP TABLE IF EXISTS restaurants;

DROP TABLE IF EXISTS temporary_users;

DROP TRIGGER IF EXISTS update_user_tokens_modtime;
DROP TABLE IF EXISTS user_tokens;

DROP TRIGGER IF EXISTS update_users_modtime;
DROP TABLE IF EXISTS users;

DROP TRIGGER IF EXISTS update_categories_modtime;
DROP TABLE IF EXISTS categories;
