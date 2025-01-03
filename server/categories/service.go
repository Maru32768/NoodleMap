package categories

import (
	"server/infra"
)

import (
	"context"
)

type Service struct {
	store *infra.Store
}

func NewService(store *infra.Store) *Service {
	return &Service{
		store: store,
	}
}

func (s *Service) FindCategories(ctx context.Context) ([]infra.FindAllCategoriesRow, error) {
	cs, err := s.store.FindAllCategories(ctx)
	if err != nil {
		return nil, err
	}
	return cs, nil
}
