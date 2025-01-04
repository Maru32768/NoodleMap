-- name: FindAllRestaurants :many
select r.id,
       r.name,
       r.lat,
       r.lng,
       r.address,
       r.closed,
       r.google_place_id,
       bool_and(vr.id is not null)                     as visited,
       coalesce(avg(vr.rate), 0)::double precision     as rate,
       coalesce(bool_and(vr.favorite), false)::boolean as favorite
from restaurants r
         left join visited_restaurants vr on r.id = vr.restaurant_id
group by r.id, r.name, r.lat, r.lng, r.address, r.closed, r.google_place_id;

-- name: FindCategoriesByRestaurantIds :many
select c.id, rc.restaurant_id
from categories c
         inner join restaurants_categories rc on c.id = rc.category_id
where rc.restaurant_id = any ($1::uuid[]);
