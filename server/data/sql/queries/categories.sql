-- name: FindAllCategories :many
select c.id, c.label, c.icon
from categories c;
