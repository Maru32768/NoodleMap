package restaurants

import (
	"context"
	"errors"
	"github.com/google/uuid"
	"server/auth"
	"server/infra"
	"strconv"
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
	PostalCode    string      `json:"postalCode"`
	Address       string      `json:"address"`
	GooglePlaceID string      `json:"googlePlaceId"`
	Visited       bool        `json:"visited"`
	Rate          float64     `json:"rate"`
	Favorite      bool        `json:"favorite"`
	Categories    []uuid.UUID `json:"categories"`
}

type AddRestaurantCommand struct {
	Name          string      `json:"name"`
	Lat           float64     `json:"lat"`
	Lng           float64     `json:"lng"`
	PostalCode    string      `json:"postalCode"`
	Address       string      `json:"address"`
	Closed        bool        `json:"closed"`
	GooglePlaceID string      `json:"googlePlaceId"`
	Categories    []uuid.UUID `json:"categories"`
}

type UpdateRestaurantCommand struct {
	Name          string  `json:"name"`
	Lat           float64 `json:"lat"`
	Lng           float64 `json:"lng"`
	PostalCode    string  `json:"postalCode"`
	Address       string  `json:"address"`
	Closed        bool    `json:"closed"`
	GooglePlaceID string  `json:"googlePlaceId"`
	Visited       bool    `json:"visited"`
	Rate          float64 `json:"rate"`
	Favorite      bool    `json:"favorite"`
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
			PostalCode:    r.PostalCode,
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

func (s *Service) AddRestaurant(ctx context.Context, command AddRestaurantCommand) (*RegisteredRestaurant, error) {
	user, err := auth.GetContextUser(ctx)
	if err != nil {
		return nil, err
	}

	if !user.IsAdmin {
		return nil, errors.New("permission denied")
	}

	params := infra.InsertRestaurantParams{
		ID:            uuid.New(),
		Name:          command.Name,
		Lat:           command.Lat,
		Lng:           command.Lng,
		PostalCode:    command.PostalCode,
		Address:       command.Address,
		Closed:        command.Closed,
		GooglePlaceID: command.GooglePlaceID,
	}

	if err := s.store.ExecTx(ctx, func(store *infra.Store) error {
		err := store.InsertRestaurant(ctx, params)
		if err != nil {
			return err
		}

		for _, category := range command.Categories {
			if err := store.InsertRestaurantCategory(ctx, infra.InsertRestaurantCategoryParams{ID: uuid.New(), RestaurantID: params.ID, CategoryID: category}); err != nil {
				return err
			}
		}

		return nil
	}); err != nil {
		return nil, err
	}

	return &RegisteredRestaurant{
		ID:            params.ID,
		Name:          params.Name,
		Lat:           params.Lat,
		Lng:           params.Lng,
		Closed:        params.Closed,
		Address:       params.Address,
		GooglePlaceID: params.GooglePlaceID,
		Visited:       false,
		Rate:          0,
		Favorite:      false,
		Categories:    command.Categories,
	}, nil
}

func (s *Service) UpdateRestaurant(ctx context.Context, id uuid.UUID, command UpdateRestaurantCommand) error {
	user, err := auth.GetContextUser(ctx)
	if err != nil {
		return err
	}

	if !user.IsAdmin {
		return errors.New("permission denied")
	}

	params := infra.UpdateRestaurantParams{
		ID:            id,
		Name:          command.Name,
		Lat:           command.Lat,
		Lng:           command.Lng,
		PostalCode:    command.PostalCode,
		Address:       command.Address,
		Closed:        command.Closed,
		GooglePlaceID: command.GooglePlaceID,
	}

	if err := s.store.ExecTx(ctx, func(store *infra.Store) error {
		if err := store.UpdateRestaurant(ctx, params); err != nil {
			return err
		}

		// TODO impl updating categories

		if command.Visited {
			if err := store.UpsertVisitedRestaurant(ctx, infra.UpsertVisitedRestaurantParams{
				ID:           uuid.New(),
				RestaurantID: id,
				Rate:         strconv.FormatFloat(command.Rate, 'f', -1, 64),
				Favorite:     command.Favorite,
			}); err != nil {
				return err
			}
		} else {
			if err := store.DeleteVisitedRestaurantByRestaurantId(ctx, id); err != nil {
				return err
			}
		}

		return nil
	}); err != nil {
		return err
	}

	return nil
}
