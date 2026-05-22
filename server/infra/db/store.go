package db

import (
	"context"
	"database/sql"
)

type Store struct {
	*Queries
	db *sql.DB
}

func NewStore(db *sql.DB) *Store {
	return &Store{
		db:      db,
		Queries: New(db),
	}
}

func (store *Store) Tx(ctx context.Context, fn func(txStore *Store) error) (err error) {
	tx, err := store.db.BeginTx(ctx, &sql.TxOptions{})
	if err != nil {
		return err
	}
	defer func() {
		if p := recover(); p != nil {
			_ = tx.Rollback()
			panic(p)
		} else if err != nil {
			_ = tx.Rollback()
		}
	}()

	txStore := &Store{
		db:      store.db,
		Queries: New(store.db).WithTx(tx),
	}
	if err = fn(txStore); err != nil {
		return err
	}

	return tx.Commit()
}
