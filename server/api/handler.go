package api

import (
	"github.com/gin-gonic/gin"
	"server/auth"
	"server/categories"
	"server/restaurants"
)

type Handler struct {
	authHandler       *auth.Handler
	categoryHandler   *categories.Handler
	restaurantHandler *restaurants.Handler
}

func NewHandler(
	authHandler *auth.Handler,
	categoryHandler *categories.Handler,
	restaurantHandler *restaurants.Handler,
) *Handler {
	return &Handler{
		authHandler:       authHandler,
		categoryHandler:   categoryHandler,
		restaurantHandler: restaurantHandler,
	}
}

func (h *Handler) Logout(ctx *gin.Context) {
	if !h.authenticate(ctx) {
		return
	}
	h.authHandler.Logout(ctx)
}

func (h *Handler) Me(ctx *gin.Context) {
	if !h.authenticate(ctx) {
		return
	}
	h.authHandler.Me(ctx)
}

func (h *Handler) AddRestaurant(ctx *gin.Context) {
	if !h.authenticate(ctx) {
		return
	}
	h.restaurantHandler.AddRestaurant(ctx)
}

func (h *Handler) UpdateRestaurant(ctx *gin.Context, _ Uuid) {
	if !h.authenticate(ctx) {
		return
	}
	h.restaurantHandler.UpdateRestaurant(ctx)
}

func (h *Handler) ListCategories(ctx *gin.Context) {
	h.categoryHandler.GetCategories(ctx)
}

func (h *Handler) Login(ctx *gin.Context) {
	h.authHandler.Login(ctx)
}

func (h *Handler) Register(ctx *gin.Context) {
	h.authHandler.Register(ctx)
}

func (h *Handler) ListRestaurants(ctx *gin.Context) {
	h.restaurantHandler.GetRestaurants(ctx)
}

func (h *Handler) authenticate(ctx *gin.Context) bool {
	h.authHandler.Authenticate(ctx)
	return !ctx.IsAborted()
}
