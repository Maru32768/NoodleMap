create table users
(
    id         uuid           not null primary key,
    email      varchar(255)   not null unique,
    password   varchar(65535) not null,
    salt       varchar(255)   not null,
    is_admin   boolean        not null,
    created_at timestamptz    not null default now(),
    updated_at timestamptz    not null default now()
);

create trigger update_users_modtime
    before update
    on users
    for each row
execute procedure update_timestamp();

create table user_tokens
(
    id         uuid           not null primary key,
    user_id    uuid           not null unique,
    token      varchar(65535) not null,
    created_at timestamptz    not null default now(),
    updated_at timestamptz    not null default now(),
    foreign key (user_id) references users (id)
);

create trigger update_user_tokens_modtime
    before update
    on user_tokens
    for each row
execute procedure update_timestamp();
