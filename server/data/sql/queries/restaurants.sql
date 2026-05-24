-- name: FindAllRestaurants :many
select r.id,
       r.name,
       r.lat,
       r.lng,
       r.postal_code,
       r.address,
       r.closed,
       r.google_place_id,
       vr.id IS NOT NULL        as visited,
       COALESCE(vr.rate, 0.0)   as rate,
       COALESCE(vr.favorite, 0) as favorite
from restaurants r
         left join visited_restaurants vr on r.id = vr.restaurant_id;

-- name: FindAllRestaurantCategories :many
select c.id, rc.restaurant_id
from categories c
         inner join restaurants_categories rc on c.id = rc.category_id;

-- name: InsertRestaurant :exec
insert into restaurants (id, name, lat, lng, postal_code, address, closed, google_place_id)
values (?, ?, ?, ?, ?, ?, ?, ?);

-- name: UpdateRestaurant :exec
update restaurants
set name            = ?,
    lat             = ?,
    lng             = ?,
    postal_code     = ?,
    address         = ?,
    closed          = ?,
    google_place_id = ?
where id = ?;

-- name: InsertRestaurantCategory :exec
insert into restaurants_categories(id, restaurant_id, category_id)
values (?, ?, ?);

-- name: UpsertVisitedRestaurant :exec
insert into visited_restaurants(id, restaurant_id, rate, favorite)
values (?, ?, ?, ?)
on conflict(restaurant_id)
    do update set rate     = excluded.rate,
                  favorite = excluded.favorite;

-- name: DeleteVisitedRestaurantByRestaurantId :exec
delete
from visited_restaurants
where restaurant_id = ?;
