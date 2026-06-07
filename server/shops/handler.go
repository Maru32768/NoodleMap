package shops

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

func (h *Handler) GetShops(ctx *gin.Context) {
	rs, err := h.findRegisteredShops(ctx)
	if err != nil {
		ctx.Error(err)
		httperrors.InternalServerError(ctx)
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"shops": rs,
	})
}

func (h *Handler) AddShop(ctx *gin.Context) {
	var command AddShopCommand
	if err := ctx.BindJSON(&command); err != nil {
		httperrors.BadRequest(ctx, "invalid request")
		return
	}

	r, err := h.addShop(ctx, command)
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

func (h *Handler) UpdateShop(ctx *gin.Context) {
	id, err := uuid.Parse(ctx.Param("id"))
	if err != nil {
		httperrors.BadRequest(ctx, "invalid id")
		return
	}

	var command UpdateShopCommand
	if err := ctx.BindJSON(&command); err != nil {
		httperrors.BadRequest(ctx, "invalid request")
		return
	}

	if err := h.updateShop(ctx, id, command); err != nil {
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

func (h *Handler) findRegisteredShops(ctx *gin.Context) ([]RegisteredShop, error) {
	rs, err := h.store.FindAllShops(ctx)
	if err != nil {
		return nil, err
	}

	res := make([]RegisteredShop, 0)
	for _, r := range rs {
		res = append(res, RegisteredShop{
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

func (h *Handler) addShop(ctx *gin.Context, command AddShopCommand) (*RegisteredShop, error) {
	user, err := auth.GetContextUser(ctx)
	if err != nil {
		return nil, err
	}

	if !user.IsAdmin {
		return nil, errPermissionDenied
	}

	params := db.InsertShopParams{
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

	if err := h.store.InsertShop(ctx, params); err != nil {
		return nil, err
	}

	return &RegisteredShop{
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

func (h *Handler) updateShop(ctx *gin.Context, id uuid.UUID, command UpdateShopCommand) error {
	user, err := auth.GetContextUser(ctx)
	if err != nil {
		return err
	}

	if !user.IsAdmin {
		return errPermissionDenied
	}

	params := db.UpdateShopParams{
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
		if err := store.UpdateShop(ctx, params); err != nil {
			return err
		}

		if command.Visited {
			if err := store.UpsertVisitedShop(ctx, db.UpsertVisitedShopParams{
				ID:       uuid.New(),
				ShopID:   id,
				Rate:     command.Rate,
				Favorite: command.Favorite,
			}); err != nil {
				return err
			}
		} else {
			if err := store.DeleteVisitedShopByShopId(ctx, id); err != nil {
				return err
			}
		}

		return nil
	}); err != nil {
		return err
	}

	return nil
}
