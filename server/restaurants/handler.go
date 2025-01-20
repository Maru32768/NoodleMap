package restaurants

import (
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
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

func (h *Handler) AddRestaurant(ctx *gin.Context) {
	var command AddRestaurantCommand
	if err := ctx.BindJSON(&command); err != nil {
		ctx.AbortWithError(http.StatusBadRequest, err)
		return
	}

	r, err := h.service.AddRestaurant(ctx, command)
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

	if err := h.service.UpdateRestaurant(ctx, id, command); err != nil {
		ctx.AbortWithError(http.StatusInternalServerError, err)
		return
	}

	ctx.Status(http.StatusOK)
}
