package restaurants

import (
	"errors"
	"net/http"
	"server/auth"
	"server/httperrors"
	"server/infra/db"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type Handler struct {
	store *db.Store
}

var errPermissionDenied = errors.New("permission denied")

func NewHandler(store *db.Store) *Handler {
	return &Handler{
		store: store,
	}
}

func (h *Handler) GetRestaurants(ctx *gin.Context) {
	rs, err := h.findRegisteredRestaurants(ctx)
	if err != nil {
		ctx.Error(err)
		httperrors.InternalServerError(ctx)
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"restaurants": rs,
	})
}

func (h *Handler) AddRestaurant(ctx *gin.Context) {
	var command AddRestaurantCommand
	if err := ctx.BindJSON(&command); err != nil {
		httperrors.BadRequest(ctx, "invalid request")
		return
	}

	r, err := h.addRestaurant(ctx, command)
	if err != nil {
		if errors.Is(err, errPermissionDenied) {
			httperrors.Abort(ctx, http.StatusForbidden, httperrors.PermissionDenied, "permission denied")
			return
		}
		ctx.Error(err)
		httperrors.InternalServerError(ctx)
		return
	}

	ctx.JSON(http.StatusOK, r)
}

func (h *Handler) UpdateRestaurant(ctx *gin.Context) {
	id, err := uuid.Parse(ctx.Param("id"))
	if err != nil {
		httperrors.BadRequest(ctx, "invalid id")
		return
	}

	var command UpdateRestaurantCommand
	if err := ctx.BindJSON(&command); err != nil {
		httperrors.BadRequest(ctx, "invalid request")
		return
	}

	if err := h.updateRestaurant(ctx, id, command); err != nil {
		if errors.Is(err, errPermissionDenied) {
			httperrors.Abort(ctx, http.StatusForbidden, httperrors.PermissionDenied, "permission denied")
			return
		}
		ctx.Error(err)
		httperrors.InternalServerError(ctx)
		return
	}

	ctx.Status(http.StatusOK)
}

func (h *Handler) findRegisteredRestaurants(ctx *gin.Context) ([]RegisteredRestaurant, error) {
	rs, err := h.store.FindAllRestaurants(ctx)
	if err != nil {
		return nil, err
	}

	res := make([]RegisteredRestaurant, 0)
	for _, r := range rs {
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
			Category:      r.Category,
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
		return nil, errPermissionDenied
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
		Category:      command.Category,
	}

	if err := h.store.InsertRestaurant(ctx, params); err != nil {
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
		PostalCode:    params.PostalCode,
		Visited:       false,
		Rate:          0,
		Favorite:      false,
		Category:      params.Category,
	}, nil
}

func (h *Handler) updateRestaurant(ctx *gin.Context, id uuid.UUID, command UpdateRestaurantCommand) error {
	user, err := auth.GetContextUser(ctx)
	if err != nil {
		return err
	}

	if !user.IsAdmin {
		return errPermissionDenied
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
		Category:      command.Category,
	}

	if err := h.store.Tx(ctx, func(store *db.Store) error {
		if err := store.UpdateRestaurant(ctx, params); err != nil {
			return err
		}

		if command.Visited {
			if err := store.UpsertVisitedRestaurant(ctx, db.UpsertVisitedRestaurantParams{
				ID:           uuid.New(),
				RestaurantID: id,
				Rate:         command.Rate,
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
