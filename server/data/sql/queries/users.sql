-- name: FindUserById :one
select id, email, is_admin
from users
where id = ?;

-- name: FindUserByEmail :one
select id, email, password, salt, is_admin
from users
where email = ?;

-- name: InsertUser :exec
insert into users(id, email, password, salt, is_admin)
values (?, ?, ?, ?, ?);

-- name: FindTokenByUserId :one
select token
from user_tokens
where user_id = ?;

-- name: InsertToken :exec
insert into user_tokens(id, user_id, token)
values (?, ?, ?);

-- name: DeleteTokenByUserId :exec
delete
from user_tokens
where user_id = ?;
