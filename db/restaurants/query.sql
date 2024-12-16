-- name: FindAllRestaurants :many
select *
from restaurants;

-- name: FindAllVisitedRestaurants :many
select *
from visited_restaurants;
