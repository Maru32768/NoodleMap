insert into restaurants
    (id, name, lat, lng, address, google_place_id)
values ('e493d756-ea65-433a-91d0-eb3fc4a9c5c0',
        'RAMEN MATSUI',
        35.6887731,
        139.7151334,
        'Test Address',
        'ChIJGUxqAGCNGGARO3hE-VYdT1E'),
       ('4fe1e70a-f8d7-4800-a5d7-b29c3cbbe267',
        'Ramen Afro Beats',
        35.6887899,
        139.7112803,
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
