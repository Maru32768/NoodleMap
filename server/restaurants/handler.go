package restaurants

import (
	"errors"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"net/http"
	"server/auth"
	"server/infra/db"
	"strconv"
)

type Handler struct {
	store *db.Store
}

func NewHandler(store *db.Store) *Handler {
	return &Handler{
		store: store,
	}
}

func (h *Handler) GetRestaurants(ctx *gin.Context) {
	rs, err := h.findRegisteredRestaurants(ctx)
	if err != nil {
		ctx.AbortWithError(http.StatusInternalServerError, err)
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"restaurants": rs,
	})
}

func (h *Handler) AddRestaurant(ctx *gin.Context) {
	var command AddRestaurantCommand
	if err := ctx.BindJSON(&command); err != nil {
		ctx.AbortWithError(http.StatusBadRequest, err)
		return
	}

	r, err := h.addRestaurant(ctx, command)
	if err != nil {
		ctx.AbortWithError(http.StatusInternalServerError, err)
		return
	}

	ctx.JSON(http.StatusOK, r)
}

func (h *Handler) UpdateRestaurant(ctx *gin.Context) {
	id, err := uuid.Parse(ctx.Param("id"))
	if err != nil {
		ctx.AbortWithError(http.StatusBadRequest, err)
		return
	}

	var command UpdateRestaurantCommand
	if err := ctx.BindJSON(&command); err != nil {
		ctx.AbortWithError(http.StatusBadRequest, err)
		return
	}

	if err := h.updateRestaurant(ctx, id, command); err != nil {
		ctx.AbortWithError(http.StatusInternalServerError, err)
		return
	}

	ctx.Status(http.StatusOK)
}

func (h *Handler) findRegisteredRestaurants(ctx *gin.Context) ([]RegisteredRestaurant, error) {
	rs, err := h.store.FindAllRestaurants(ctx)
	if err != nil {
		return nil, err
	}

	ids := make([]uuid.UUID, 0, len(rs))
	for _, r := range rs {
		ids = append(ids, r.ID)
	}
	cs, err := h.store.FindCategoriesByRestaurantIds(ctx, ids)
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

func (h *Handler) addRestaurant(ctx *gin.Context, command AddRestaurantCommand) (*RegisteredRestaurant, error) {
	user, err := auth.GetContextUser(ctx)
	if err != nil {
		return nil, err
	}

	if !user.IsAdmin {
		return nil, errors.New("permission denied")
	}

	params := db.InsertRestaurantParams{
		ID:            uuid.New(),
		Name:          command.Name,
		Lat:           command.Lat,
		Lng:           command.Lng,
		PostalCode:    command.PostalCode,
		Address:       command.Address,
		Closed:        command.Closed,
		GooglePlaceID: command.GooglePlaceID,
	}

	if err := h.store.ExecTx(ctx, func(store *db.Store) error {
		err := store.InsertRestaurant(ctx, params)
		if err != nil {
			return err
		}

		for _, category := range command.Categories {
			if err := store.InsertRestaurantCategory(ctx, db.InsertRestaurantCategoryParams{ID: uuid.New(), RestaurantID: params.ID, CategoryID: category}); err != nil {
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

func (h *Handler) updateRestaurant(ctx *gin.Context, id uuid.UUID, command UpdateRestaurantCommand) error {
	user, err := auth.GetContextUser(ctx)
	if err != nil {
		return err
	}

	if !user.IsAdmin {
		return errors.New("permission denied")
	}

	params := db.UpdateRestaurantParams{
		ID:            id,
		Name:          command.Name,
		Lat:           command.Lat,
		Lng:           command.Lng,
		PostalCode:    command.PostalCode,
		Address:       command.Address,
		Closed:        command.Closed,
		GooglePlaceID: command.GooglePlaceID,
	}

	if err := h.store.ExecTx(ctx, func(store *db.Store) error {
		if err := store.UpdateRestaurant(ctx, params); err != nil {
			return err
		}

		// TODO impl updating categories

		if command.Visited {
			if err := store.UpsertVisitedRestaurant(ctx, db.UpsertVisitedRestaurantParams{
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
