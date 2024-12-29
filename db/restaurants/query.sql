-- name: FindAllRestaurants :many
select r.id,
       r.name,
       r.lat,
       r.lng,
       r.address,
       r.google_place_id,
       bool_and(vr.id is not null) as visited
--        avg(vr.rate)                as rate,
--        bool_and(vr.favorite)       as favorite
from restaurants r
         left join visited_restaurants vr on r.id = vr.restaurant_id
group by r.id, r.name, r.lat, r.lng, r.address, r.google_place_id;

-- name: FindCategoriesByRestaurantIds :many
select c.id, c.label, rc.restaurant_id
from categories c
         inner join restaurants_categories rc on c.id = rc.category_id
where rc.restaurant_id = any ($1::uuid[]);
