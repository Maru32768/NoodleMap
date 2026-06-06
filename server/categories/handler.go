package categories

import (
	"net/http"
	"server/httperrors"
	"server/infra/db"

	"github.com/gin-gonic/gin"
)

type Handler struct {
	store *db.Store
}

func NewHandler(store *db.Store) *Handler {
	return &Handler{
		store: store,
	}
}

func (h *Handler) GetCategories(ctx *gin.Context) {
	cs, err := h.store.FindAllCategories(ctx)
	if err != nil {
		ctx.Error(err)
		httperrors.InternalServerError(ctx)
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"categories": cs,
	})
}
