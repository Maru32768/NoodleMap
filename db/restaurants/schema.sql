create table restaurants
(
    id              uuid             not null primary key,
    name            varchar(65535)   not null,
    lat             double precision not null,
    lng             double precision not null,
    postal_code     varchar(255)     not null,
    address         varchar(65535)   not null,
    google_place_id varchar(255)     not null unique,
    closed          boolean          not null,
    created_at      timestamptz      not null default now(),
    updated_at      timestamptz      not null default now()
);

create table visited_restaurants
(
    id            uuid        not null primary key,
    restaurant_id uuid        not null unique,
    rate          decimal     not null,
    favorite      boolean     not null,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    foreign key (restaurant_id) references restaurants
);

create table restaurants_categories
(
    id            uuid        not null primary key,
    restaurant_id uuid        not null,
    category_id   uuid        not null,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    foreign key (restaurant_id) references restaurants,
    foreign key (category_id) references categories
);

create table restaurant_images
(
    id            uuid           not null primary key,
    restaurant_id uuid           not null,
    path          varchar(65535) not null,
    created_at    timestamptz    not null default now(),
    updated_at    timestamptz    not null default now(),
    foreign key (restaurant_id) references restaurants
)
