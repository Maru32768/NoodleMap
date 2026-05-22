package categories

import (
	"github.com/gin-gonic/gin"
	"net/http"
	"server/infra/db"
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
		ctx.AbortWithError(http.StatusInternalServerError, err)
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"categories": cs,
	})
}
