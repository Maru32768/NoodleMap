package restaurants

import (
	"github.com/gin-gonic/gin"
	"net/http"
)

type Handler struct {
	service *Service
}

func NewHandler(service *Service) *Handler {
	return &Handler{
		service: service,
	}
}

func (h *Handler) GetRestaurants(ctx *gin.Context) {
	rs, err := h.service.FindRegisteredRestaurants(ctx)
	if err != nil {
		ctx.AbortWithError(http.StatusInternalServerError, err)
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"restaurants": rs,
	})
}
