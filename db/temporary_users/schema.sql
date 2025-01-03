create table temporary_users
(
    id         uuid         not null primary key,
    email      varchar(255) not null,
    token      varchar(255) not null,
    created_at timestamptz  not null default now()
)
