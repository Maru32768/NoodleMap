package auth

import (
	"errors"
	"github.com/gin-gonic/gin"
	"net/http"
	"strings"
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
		ctx.AbortWithError(http.StatusBadRequest, errors.New("no Authorization header"))
		return
	}
	if !strings.HasPrefix(authorization, "Bearer ") {
		ctx.AbortWithError(http.StatusBadRequest, errors.New("not supported token type"))
		return
	}
	token := strings.TrimPrefix(authorization, "Bearer ")

	user, err := h.service.Authenticate(ctx, token)
	if err != nil {
		ctx.AbortWithError(http.StatusBadRequest, err)
		return
	}

	ctx.Set("user", user)
}

func (h *Handler) Me(ctx *gin.Context) {
	user, err := GetContextUser(ctx)
	if err != nil {
		ctx.AbortWithError(http.StatusInternalServerError, err)
		return
	}

	ctx.JSON(http.StatusOK, user)
}

func (h *Handler) Register(ctx *gin.Context) {
	type request struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	var req request
	if err := ctx.BindJSON(&req); err != nil {
		ctx.AbortWithError(http.StatusBadRequest, err)
		return
	}

	user, token, err := h.service.Register(ctx, req.Email, req.Password)
	if err != nil {
		ctx.AbortWithError(http.StatusBadRequest, err)
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"user":  user,
		"token": token,
	})
}

func (h *Handler) Login(ctx *gin.Context) {
	type request struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	var req request
	ctx.BindJSON(&req)

	user, token, err := h.service.Login(ctx, req.Email, req.Password)
	if err != nil {
		ctx.AbortWithError(http.StatusBadRequest, err)
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"user":  user,
		"token": token,
	})
}

func (h *Handler) Logout(ctx *gin.Context) {
	user, err := GetContextUser(ctx)
	if err != nil {
		ctx.AbortWithError(http.StatusBadRequest, err)
		return
	}

	if err := h.service.Logout(ctx, user.ID); err != nil {
		ctx.AbortWithError(http.StatusInternalServerError, err)
		return
	}

	ctx.Status(http.StatusOK)
}
