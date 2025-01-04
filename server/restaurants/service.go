package restaurants

import (
	"context"
	"github.com/google/uuid"
	"server/infra"
)

type Service struct {
	store *infra.Store
}

type RegisteredRestaurant struct {
	ID            uuid.UUID   `json:"id"`
	Name          string      `json:"name"`
	Lat           float64     `json:"lat"`
	Lng           float64     `json:"lng"`
	Closed        bool        `json:"closed"`
	Address       string      `json:"address"`
	GooglePlaceID string      `json:"googlePlaceId"`
	Visited       bool        `json:"visited"`
	Rate          float64     `json:"rate"`
	Favorite      bool        `json:"favorite"`
	Categories    []uuid.UUID `json:"categories"`
}

func NewService(store *infra.Store) *Service {
	return &Service{
		store: store,
	}
}

func (s *Service) FindRegisteredRestaurants(ctx context.Context) ([]RegisteredRestaurant, error) {
	rs, err := s.store.FindAllRestaurants(ctx)
	if err != nil {
		return nil, err
	}

	ids := make([]uuid.UUID, len(rs))
	for _, r := range rs {
		ids = append(ids, r.ID)
	}
	cs, err := s.store.FindCategoriesByRestaurantIds(ctx, ids)
	if err != nil {
		return nil, err
	}
	restaurantCategoryIdsMap := make(map[uuid.UUID][]uuid.UUID)
	for _, c := range cs {
		arr, ok := restaurantCategoryIdsMap[c.RestaurantID]
		if !ok {
			arr = make([]uuid.UUID, 0)
		}
		arr = append(arr, c.ID)
		restaurantCategoryIdsMap[c.RestaurantID] = arr
	}

	res := make([]RegisteredRestaurant, 0)
	for _, r := range rs {
		c, ok := restaurantCategoryIdsMap[r.ID]
		if !ok {
			c = make([]uuid.UUID, 0)
		}

		res = append(res, RegisteredRestaurant{
			ID:            r.ID,
			Name:          r.Name,
			Lat:           r.Lat,
			Lng:           r.Lng,
			Closed:        r.Closed,
			Address:       r.Address,
			GooglePlaceID: r.GooglePlaceID,
			Visited:       r.Visited,
			Rate:          r.Rate,
			Favorite:      r.Favorite,
			Categories:    c,
		})
	}

	return res, nil
}
