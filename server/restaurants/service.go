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
	ID            uuid.UUID                                `json:"id"`
	Name          string                                   `json:"name"`
	Lat           float64                                  `json:"lat"`
	Lng           float64                                  `json:"lng"`
	Address       string                                   `json:"address"`
	GooglePlaceID string                                   `json:"googlePlaceId"`
	Visited       bool                                     `json:"visited"`
	Rate          float64                                  `json:"rate"`
	Favorite      bool                                     `json:"favorite"`
	Categories    []infra.FindCategoriesByRestaurantIdsRow `json:"categories"`
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
	restaurantCategoriesMap := make(map[uuid.UUID][]infra.FindCategoriesByRestaurantIdsRow)
	for _, c := range cs {
		arr, ok := restaurantCategoriesMap[c.RestaurantID]
		if !ok {
			arr = make([]infra.FindCategoriesByRestaurantIdsRow, 0)
		}
		arr = append(arr, c)
		restaurantCategoriesMap[c.RestaurantID] = arr
	}

	res := make([]RegisteredRestaurant, 0)
	for _, r := range rs {
		c, ok := restaurantCategoriesMap[r.ID]
		if !ok {
			c = make([]infra.FindCategoriesByRestaurantIdsRow, 0)
		}

		res = append(res, RegisteredRestaurant{
			ID:            r.ID,
			Name:          r.Name,
			Lat:           r.Lat,
			Lng:           r.Lng,
			Address:       r.Address,
			GooglePlaceID: r.GooglePlaceID,
			Visited:       r.Visited,
			//Rate:          r.Rate,
			//Favorite:      r.Favorite,
			Categories: c,
		})
	}

	return res, nil
}
