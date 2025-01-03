package infra

import (
	"context"
	"database/sql"
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

func (store *Store) ExecTx(ctx context.Context, fn func(store *Store) error) (err error) {
	tx, err := store.db.BeginTx(ctx, &sql.TxOptions{})
	if err != nil {
		return err
	}
	defer func() {
		if p := recover(); p != nil {
			_ = tx.Rollback()
		} else if err != nil {
			_ = tx.Rollback()
		}
	}()

	s := &Store{
		db:      store.db,
		Querier: New(store.db).WithTx(tx),
	}
	if err = fn(s); err != nil {
		return err
	}

	return tx.Commit()
}
