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

create trigger update_restaurants_modtime
    before update
    on restaurants
    for each row
execute procedure update_timestamp();

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

create trigger update_visited_restaurants_modtime
    before update
    on visited_restaurants
    for each row
execute procedure update_timestamp();

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

create trigger update_restaurants_categories_modtime
    before update
    on restaurants_categories
    for each row
execute procedure update_timestamp();

create table restaurant_images
(
    id            uuid           not null primary key,
    restaurant_id uuid           not null,
    path          varchar(65535) not null,
    created_at    timestamptz    not null default now(),
    updated_at    timestamptz    not null default now(),
    foreign key (restaurant_id) references restaurants
);

create trigger update_restaurant_images_modtime
    before update
    on restaurant_images
    for each row
execute procedure update_timestamp();
