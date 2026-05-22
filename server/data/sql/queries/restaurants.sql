-- name: FindAllRestaurants :many
select r.id,
       r.name,
       r.lat,
       r.lng,
       r.postal_code,
       r.address,
       r.closed,
       r.google_place_id,
       bool_and(vr.id is not null)                     as visited,
       coalesce(avg(vr.rate), 0)::double precision     as rate,
       coalesce(bool_and(vr.favorite), false)::boolean as favorite
from restaurants r
         left join visited_restaurants vr on r.id = vr.restaurant_id
group by r.id, r.name, r.lat, r.lng, r.postal_code, r.address, r.closed, r.google_place_id;

-- name: FindCategoriesByRestaurantIds :many
select c.id, rc.restaurant_id
from categories c
         inner join restaurants_categories rc on c.id = rc.category_id
where rc.restaurant_id = any ($1::uuid[]);

-- name: InsertRestaurant :exec
insert into restaurants (id, name, lat, lng, postal_code, address, closed, google_place_id)
values ($1, $2, $3, $4, $5, $6, $7, $8);

-- name: UpdateRestaurant :exec
update restaurants
set name            = $2,
    lat             = $3,
    lng             = $4,
    postal_code     = $5,
    address         = $6,
    closed          = $7,
    google_place_id = $8
where id = $1;

-- name: InsertRestaurantCategory :exec
insert
into restaurants_categories(id, restaurant_id, category_id)
values ($1, $2, $3);

-- name: UpsertVisitedRestaurant :exec
insert into visited_restaurants(id, restaurant_id, rate, favorite)
values ($1, $2, $3, $4)
on conflict(restaurant_id)
    do update set rate     = excluded.rate,
                  favorite = excluded.favorite;

-- name: DeleteVisitedRestaurantByRestaurantId :exec
delete
from visited_restaurants
where restaurant_id = $1;
