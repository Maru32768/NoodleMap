insert into restaurants
    (id, name, lat, lng, address, google_place_id)
values ('e493d756-ea65-433a-91d0-eb3fc4a9c5c0',
        'RAMEN MATSUI',
        35.68911996354835,
        139.71547333407958,
        'Test Address',
        'ChIJGUxqAGCNGGARO3hE-VYdT1E'),
       ('4fe1e70a-f8d7-4800-a5d7-b29c3cbbe267',
        'Ramen Afro Beats',
        35.69001793816234,
        139.71113100117188,
        'Test Address',
        'ChIJ0xyUTKyNGGARnudXuriv4zc');

insert into visited_restaurants
    (id, restaurant_id, rate, favorite)
values ('b9871876-6d53-405d-8cfd-6e0e12bedeba',
        'e493d756-ea65-433a-91d0-eb3fc4a9c5c0',
        5.0,
        true),
       ('67d615a0-d4c3-4227-ae7f-bea5f86f5c68',
        '4fe1e70a-f8d7-4800-a5d7-b29c3cbbe267',
        6.0,
        true);

insert into categories (id, label)
values ('fb5d927f-42d0-404c-9eae-59665ffb5772', 'ラーメン'),
       ('78fe2580-46b7-4855-ab1f-1634fcaffd26', 'つけ麺')
;

insert into restaurants_categories(id, restaurant_id, category_id)
values ('ff1704fc-4147-479b-b7d2-7125f191a2b0',
        'e493d756-ea65-433a-91d0-eb3fc4a9c5c0',
        'fb5d927f-42d0-404c-9eae-59665ffb5772'),
       ('ff1704fc-4147-479b-b7d2-7125f191a2b1',
        'e493d756-ea65-433a-91d0-eb3fc4a9c5c0',
        '78fe2580-46b7-4855-ab1f-1634fcaffd26')
;
