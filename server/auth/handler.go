package auth

import (
	"errors"
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

func (h *Handler) Authenticate(ctx *gin.Context) {
	authorization := ctx.GetHeader("Authorization")
	if authorization == "" {
		ctx.AbortWithError(http.StatusBadRequest, errors.New("no Authorization"))
	}

	user, err := h.service.Authenticate(ctx, authorization)
	if err != nil {
		ctx.AbortWithError(http.StatusInternalServerError, err)
		return
	}

	ctx.Set("user", user)
}

func (h *Handler) Signup(ctx *gin.Context) {

}

func (h *Handler) Login(ctx *gin.Context) {

}

func (h *Handler) Logout(ctx *gin.Context) {

}
