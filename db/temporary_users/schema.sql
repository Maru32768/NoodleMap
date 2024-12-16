create table temporary_users
(
    id         uuid         not null primary key,
    email      varchar(256) not null,
    token      varchar(256) not null,
    created_at timestamp    not null default now()
)
