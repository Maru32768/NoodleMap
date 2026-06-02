-- name: InsertSession :exec
insert into sessions(id, user_id, token_hash, user_agent, expires_at)
values (?, ?, ?, ?, ?);

-- Compare expires_at against a driver-bound time.Time (sqlc.arg(now)) rather than
-- CURRENT_TIMESTAMP so both sides are serialized by the same driver in the same
-- format; the comparison stays correct even if the driver's time storage format
-- changes.
-- name: FindValidSessionByTokenHash :one
select s.id, u.id as user_id, u.email
from sessions s
         inner join users u on u.id = s.user_id
where s.token_hash = sqlc.arg(token_hash)
  and s.expires_at > sqlc.arg(now);

-- Conditional extend: only writes (and fsyncs) when the session is stale, i.e.
-- when it was last extended before sqlc.arg(stale_before). This keeps the sliding
-- window without issuing a row-dirtying write on every authenticated request.
-- Returns the number of rows updated so the caller can refresh the cookie at the
-- same time it re-persists the session.
-- name: ExtendSession :execrows
update sessions
set expires_at = sqlc.arg(expires_at)
where id = sqlc.arg(id)
  and expires_at < sqlc.arg(stale_before);

-- name: DeleteSessionByTokenHash :exec
delete
from sessions
where token_hash = ?;

-- name: DeleteExpiredSessions :exec
delete
from sessions
where expires_at <= sqlc.arg(now);
