package api

import (
	"server/auth"
	"server/shops"

	"github.com/gin-gonic/gin"
)

type Handler struct {
	authHandler *auth.Handler
	shopHandler *shops.Handler
}

func NewHandler(
	authHandler *auth.Handler,
	shopHandler *shops.Handler,
) *Handler {
	return &Handler{
		authHandler: authHandler,
		shopHandler: shopHandler,
	}
}

func (h *Handler) Logout(ctx *gin.Context) {
	h.authHandler.Logout(ctx)
}

func (h *Handler) Me(ctx *gin.Context) {
	h.authHandler.Me(ctx)
}

func (h *Handler) AddShop(ctx *gin.Context) {
	h.shopHandler.AddShop(ctx)
}

func (h *Handler) UpdateShop(ctx *gin.Context, _ Uuid) {
	h.shopHandler.UpdateShop(ctx)
}

func (h *Handler) GoogleAuth(ctx *gin.Context) {
	h.authHandler.GoogleAuth(ctx)
}

func (h *Handler) ListShops(ctx *gin.Context) {
	h.shopHandler.GetShops(ctx)
}

func (h *Handler) ListTags(ctx *gin.Context) {
	h.shopHandler.GetTags(ctx)
}

func (h *Handler) SaveTags(ctx *gin.Context) {
	h.shopHandler.SaveTags(ctx)
}
