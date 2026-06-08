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

-- name: FindAllTags :many
select id,
       category,
       label,
       slug,
       color,
       sort_order,
       created_at,
       updated_at
from tags
order by sort_order, label;

-- name: InsertTag :exec
insert into tags (id, category, label, slug, color, sort_order)
values (?, ?, ?, ?, ?, ?);

-- name: UpdateTag :exec
update tags
set category   = ?,
    label      = ?,
    slug       = ?,
    color      = ?,
    sort_order = ?
where id = ?;

-- name: DeleteTag :exec
delete
from tags
where id = ?;

-- name: FindTagsByShopIds :many
select st.shop_id,
       t.id,
       t.category,
       t.label,
       t.slug,
       t.color,
       t.sort_order
from shops_tags st
         join tags t on st.tag_id = t.id
where st.shop_id in (sqlc.slice('shop_ids'))
order by st.shop_id, t.sort_order, t.label;

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

-- name: DeleteShopTagsByShopId :exec
delete
from shops_tags
where shop_id = ?;

-- name: InsertShopTag :exec
insert into shops_tags (id, shop_id, tag_id)
values (?, ?, ?);
