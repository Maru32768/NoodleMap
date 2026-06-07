package api

import (
	"github.com/gin-gonic/gin"
	"server/auth"
	"server/restaurants"
)

type Handler struct {
	authHandler       *auth.Handler
	restaurantHandler *restaurants.Handler
}

func NewHandler(
	authHandler *auth.Handler,
	restaurantHandler *restaurants.Handler,
) *Handler {
	return &Handler{
		authHandler:       authHandler,
		restaurantHandler: restaurantHandler,
	}
}

func (h *Handler) Logout(ctx *gin.Context) {
	h.authHandler.Logout(ctx)
}

func (h *Handler) Me(ctx *gin.Context) {
	h.authHandler.Me(ctx)
}

func (h *Handler) AddRestaurant(ctx *gin.Context) {
	h.restaurantHandler.AddRestaurant(ctx)
}

func (h *Handler) UpdateRestaurant(ctx *gin.Context, _ Uuid) {
	h.restaurantHandler.UpdateRestaurant(ctx)
}

func (h *Handler) GoogleAuth(ctx *gin.Context) {
	h.authHandler.GoogleAuth(ctx)
}

func (h *Handler) ListRestaurants(ctx *gin.Context) {
	h.restaurantHandler.GetRestaurants(ctx)
}
