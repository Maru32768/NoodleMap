-- +goose Up

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION update_timestamp()
    RETURNS TRIGGER AS
$$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';
-- +goose StatementEnd

CREATE TABLE IF NOT EXISTS categories
(
    id         uuid         NOT NULL PRIMARY KEY,
    label      varchar(255) NOT NULL,
    icon       text         NOT NULL,
    created_at timestamptz  NOT NULL DEFAULT now(),
    updated_at timestamptz  NOT NULL DEFAULT now()
);
CREATE OR REPLACE TRIGGER update_categories_modtime
    BEFORE UPDATE ON categories
    FOR EACH ROW EXECUTE PROCEDURE update_timestamp();

CREATE TABLE IF NOT EXISTS users
(
    id         uuid           NOT NULL PRIMARY KEY,
    email      varchar(255)   NOT NULL UNIQUE,
    password   varchar(65535) NOT NULL,
    salt       varchar(255)   NOT NULL,
    is_admin   boolean        NOT NULL,
    created_at timestamptz    NOT NULL DEFAULT now(),
    updated_at timestamptz    NOT NULL DEFAULT now()
);
CREATE OR REPLACE TRIGGER update_users_modtime
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE PROCEDURE update_timestamp();

CREATE TABLE IF NOT EXISTS user_tokens
(
    id         uuid           NOT NULL PRIMARY KEY,
    user_id    uuid           NOT NULL UNIQUE,
    token      varchar(65535) NOT NULL,
    created_at timestamptz    NOT NULL DEFAULT now(),
    updated_at timestamptz    NOT NULL DEFAULT now(),
    FOREIGN KEY (user_id) REFERENCES users (id)
);
CREATE OR REPLACE TRIGGER update_user_tokens_modtime
    BEFORE UPDATE ON user_tokens
    FOR EACH ROW EXECUTE PROCEDURE update_timestamp();

CREATE TABLE IF NOT EXISTS temporary_users
(
    id         uuid         NOT NULL PRIMARY KEY,
    email      varchar(255) NOT NULL,
    token      varchar(255) NOT NULL,
    created_at timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS restaurants
(
    id              uuid             NOT NULL PRIMARY KEY,
    name            varchar(65535)   NOT NULL,
    lat             double precision NOT NULL,
    lng             double precision NOT NULL,
    postal_code     varchar(255)     NOT NULL,
    address         varchar(65535)   NOT NULL,
    google_place_id varchar(255)     NOT NULL UNIQUE,
    closed          boolean          NOT NULL,
    created_at      timestamptz      NOT NULL DEFAULT now(),
    updated_at      timestamptz      NOT NULL DEFAULT now()
);
CREATE OR REPLACE TRIGGER update_restaurants_modtime
    BEFORE UPDATE ON restaurants
    FOR EACH ROW EXECUTE PROCEDURE update_timestamp();

CREATE TABLE IF NOT EXISTS visited_restaurants
(
    id            uuid        NOT NULL PRIMARY KEY,
    restaurant_id uuid        NOT NULL UNIQUE,
    rate          decimal     NOT NULL,
    favorite      boolean     NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (restaurant_id) REFERENCES restaurants
);
CREATE OR REPLACE TRIGGER update_visited_restaurants_modtime
    BEFORE UPDATE ON visited_restaurants
    FOR EACH ROW EXECUTE PROCEDURE update_timestamp();

CREATE TABLE IF NOT EXISTS restaurants_categories
(
    id            uuid        NOT NULL PRIMARY KEY,
    restaurant_id uuid        NOT NULL,
    category_id   uuid        NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (restaurant_id) REFERENCES restaurants,
    FOREIGN KEY (category_id) REFERENCES categories
);
CREATE OR REPLACE TRIGGER update_restaurants_categories_modtime
    BEFORE UPDATE ON restaurants_categories
    FOR EACH ROW EXECUTE PROCEDURE update_timestamp();

CREATE TABLE IF NOT EXISTS restaurant_images
(
    id            uuid           NOT NULL PRIMARY KEY,
    restaurant_id uuid           NOT NULL,
    path          varchar(65535) NOT NULL,
    created_at    timestamptz    NOT NULL DEFAULT now(),
    updated_at    timestamptz    NOT NULL DEFAULT now(),
    FOREIGN KEY (restaurant_id) REFERENCES restaurants
);
CREATE OR REPLACE TRIGGER update_restaurant_images_modtime
    BEFORE UPDATE ON restaurant_images
    FOR EACH ROW EXECUTE PROCEDURE update_timestamp();

-- +goose Down

DROP TRIGGER IF EXISTS update_restaurant_images_modtime ON restaurant_images;
DROP TABLE IF EXISTS restaurant_images;

DROP TRIGGER IF EXISTS update_restaurants_categories_modtime ON restaurants_categories;
DROP TABLE IF EXISTS restaurants_categories;

DROP TRIGGER IF EXISTS update_visited_restaurants_modtime ON visited_restaurants;
DROP TABLE IF EXISTS visited_restaurants;

DROP TRIGGER IF EXISTS update_restaurants_modtime ON restaurants;
DROP TABLE IF EXISTS restaurants;

DROP TABLE IF EXISTS temporary_users;

DROP TRIGGER IF EXISTS update_user_tokens_modtime ON user_tokens;
DROP TABLE IF EXISTS user_tokens;

DROP TRIGGER IF EXISTS update_users_modtime ON users;
DROP TABLE IF EXISTS users;

DROP TRIGGER IF EXISTS update_categories_modtime ON categories;
DROP TABLE IF EXISTS categories;

DROP FUNCTION IF EXISTS update_timestamp;
