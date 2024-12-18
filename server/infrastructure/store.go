package infrastructure

import (
	"context"
	"database/sql"
	"fmt"
)

type Store struct {
	Querier
	db *sql.DB
}

func NewStore(db *sql.DB) *Store {
	return &Store{
		db:      db,
		Querier: New(db),
	}
}

func (store *Store) ExecTx(ctx context.Context, fn func() error) error {
	tx, err := store.db.BeginTx(ctx, &sql.TxOptions{})
	if err != nil {
		return nil
	}

	if err := fn(); err != nil {
		if rbErr := tx.Rollback(); rbErr != nil {
			return fmt.Errorf("tx err: %v, rb err: %v", err, rbErr)
		}
		return err
	}

	return tx.Commit()
}

//const findCategoriesByRestaurantIds = `-- name: FindCategoriesByRestaurantIds :many
//select c.id, c.label
//from categories c
//         left join restaurants_categories rc on c.id = rc.category_id
//where rc.restaurant_id in (/*SLICE:ids*/?)
//`
//
//type FindCategoriesByRestaurantIdsRow struct {
//	ID    uuid.UUID `json:"id"`
//	Label string    `json:"label"`
//}
//
//func (q *Queries) FindCategoriesByRestaurantIds(ctx context.Context, ids []uuid.UUID) ([]FindCategoriesByRestaurantIdsRow, error) {
//	query := findCategoriesByRestaurantIds
//	var queryParams []interface{}
//	if len(ids) > 0 {
//		for _, v := range ids {
//			queryParams = append(queryParams, v)
//		}
//		query = strings.Replace(query, "/*SLICE:ids*/?", strings.Repeat(",?", len(ids))[1:], 1)
//	} else {
//		query = strings.Replace(query, "/*SLICE:ids*/?", "NULL", 1)
//	}
//	rows, err := q.db.QueryContext(ctx, query, queryParams...)
//	if err != nil {
//		return nil, err
//	}
//	defer rows.Close()
//	items := []FindCategoriesByRestaurantIdsRow{}
//	for rows.Next() {
//		var i FindCategoriesByRestaurantIdsRow
//		if err := rows.Scan(&i.ID, &i.Label); err != nil {
//			return nil, err
//		}
//		items = append(items, i)
//	}
//	if err := rows.Close(); err != nil {
//		return nil, err
//	}
//	if err := rows.Err(); err != nil {
//		return nil, err
//	}
//	return items, nil
//}
