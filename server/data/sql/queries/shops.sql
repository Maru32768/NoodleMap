-- name: FindAllShops :many
select r.id,
       r.name,
       r.lat,
       r.lng,
       r.postal_code,
       r.address,
       r.closed,
       r.google_place_id,
       r.category,
       vs.id IS NOT NULL        as eaten,
       COALESCE(vs.rate, 0.0)   as rate,
       COALESCE(vs.favorite, 0) as favorite
from shops r
         left join eaten_shops vs on r.id = vs.shop_id;

-- name: InsertShop :exec
insert into shops (id, name, lat, lng, postal_code, address, closed, google_place_id, category)
values (?, ?, ?, ?, ?, ?, ?, ?, ?);

-- name: UpdateShop :exec
update shops
set name            = ?,
    lat             = ?,
    lng             = ?,
    postal_code     = ?,
    address         = ?,
    closed          = ?,
    google_place_id = ?,
    category        = ?
where id = ?;

-- name: UpsertEatenShop :exec
insert into eaten_shops(id, shop_id, rate, favorite)
values (?, ?, ?, ?)
on conflict(shop_id)
    do update set rate     = excluded.rate,
                  favorite = excluded.favorite;

-- name: DeleteEatenShopByShopId :exec
delete
from eaten_shops
where shop_id = ?;
