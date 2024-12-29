insert into visited_restaurants
    (id, restaurant_id, rate, favorite)
values ('b9871876-6d53-405d-8cfd-6e0e12bedeba',
        '55608A42-9D02-029E-3AC9-FC0FE8188A75',
        5.0,
        true),
       ('67d615a0-d4c3-4227-ae7f-bea5f86f5c68',
        '25888A3B-990D-2520-F6AF-163BE0FEAB25',
        6.0,
        true);

insert into categories (id, label)
values ('fb5d927f-42d0-404c-9eae-59665ffb5772', 'ラーメン'),
       ('78fe2580-46b7-4855-ab1f-1634fcaffd26', 'つけ麺')
;

insert into restaurants_categories(id, restaurant_id, category_id)
values ('ff1704fc-4147-479b-b7d2-7125f191a2b0',
        '55608A42-9D02-029E-3AC9-FC0FE8188A75',
        'fb5d927f-42d0-404c-9eae-59665ffb5772'),
       ('ff1704fc-4147-479b-b7d2-7125f191a2b1',
        '25888A3B-990D-2520-F6AF-163BE0FEAB25',
        '78fe2580-46b7-4855-ab1f-1634fcaffd26')
;
