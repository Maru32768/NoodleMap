-- name: FindUserById :one
select id, email, is_admin
from users
where id = $1;

-- name: FindUserByEmail :one
select id, email, password, salt, is_admin
from users
where email = $1;

-- name: InsertUser :exec
insert into users(id, email, password, salt, is_admin)
values ($1, $2, $3, $4, $5);

-- name: FindTokenByUserId :one
select token
from user_tokens
where user_id = $1;

-- name: InsertToken :exec
insert into user_tokens(id, user_id, token)
values ($1, $2, $3);

-- name: DeleteTokenByUserId :exec
delete
from user_tokens
where user_id = $1;
