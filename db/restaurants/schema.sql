create table restaurants
(
    id              uuid             not null primary key,
    name            varchar(256)     not null,
    lat             double precision not null,
    lng             double precision not null,
    address         varchar(1024)    not null,
    google_place_id varchar(256)     not null,
    created_at      timestamp        not null default now(),
    updated_at      timestamp        not null default now()
);

create table visited_restaurants
(
    id            uuid      not null primary key,
    restaurant_id uuid      not null,
    rate          decimal   not null,
    favorite      boolean   not null,
    created_at    timestamp not null default now(),
    updated_at    timestamp not null default now(),
    foreign key (restaurant_id) references restaurants
);
