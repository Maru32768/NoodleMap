create table users
(
    id         uuid           not null primary key,
    email      varchar(255)   not null,
    password   varchar(65535) not null,
    salt       varchar(255)   not null,
    created_at timestamptz    not null default now(),
    updated_at timestamptz    not null default now()
);

create trigger update_users_modtime
    before update
    on users
    for each row
execute procedure update_timestamp();
