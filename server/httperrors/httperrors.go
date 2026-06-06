package httperrors

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

type Type string

const (
	InvalidRequest         Type = "invalid_request"
	AuthenticationRequired Type = "authentication_required"
	PermissionDenied       Type = "permission_denied"
	GoogleAuthFailed       Type = "google_auth_failed"
	SessionCreationFailed  Type = "session_creation_failed"
	InternalError          Type = "internal_error"
)

type Body struct {
	Type    Type   `json:"type"`
	Message string `json:"message,omitempty"`
}

func Abort(ctx *gin.Context, status int, typ Type, message string) {
	ctx.AbortWithStatusJSON(status, Body{
		Type:    typ,
		Message: message,
	})
}

func BadRequest(ctx *gin.Context, message string) {
	Abort(ctx, http.StatusBadRequest, InvalidRequest, message)
}

func InternalServerError(ctx *gin.Context) {
	Abort(ctx, http.StatusInternalServerError, InternalError, "internal error")
}
