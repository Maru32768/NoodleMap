create table categories
(
    id         uuid         not null primary key,
    label      varchar(255) not null,
    icon       text         not null,
    created_at timestamptz  not null default now(),
    updated_at timestamptz  not null default now()
);

create trigger update_categories_modtime
    before update
    on categories
    for each row
execute procedure update_timestamp();
