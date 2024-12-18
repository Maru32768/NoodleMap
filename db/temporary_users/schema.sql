create table temporary_users
(
    id         uuid         not null primary key,
    email      varchar(256) not null,
    token      varchar(256) not null,
    created_at timestamptz  not null default now()
)
