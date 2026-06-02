-- name: FindUserById :one
select id, email
from users
where id = ?;

-- name: FindUserByGoogleSub :one
select id, email
from users
where google_sub = ?;

-- name: InsertUser :exec
insert into users(id, email, google_sub)
values (?, ?, ?);
