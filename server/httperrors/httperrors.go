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

type FieldErrorType string

const (
	FieldRequired      FieldErrorType = "required"
	FieldInvalidFormat FieldErrorType = "invalid_format"
	FieldOutOfRange    FieldErrorType = "out_of_range"
	FieldTooLong       FieldErrorType = "too_long"
	FieldUnknown       FieldErrorType = "unknown"
)

type FieldError struct {
	Field   string         `json:"field"`
	Type    FieldErrorType `json:"type"`
	Message string         `json:"message,omitempty"`
}

type Body struct {
	Type        Type         `json:"type"`
	Message     string       `json:"message,omitempty"`
	FieldErrors []FieldError `json:"fieldErrors,omitempty"`
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

func BadRequestWithFieldErrors(ctx *gin.Context, message string, fieldErrors []FieldError) {
	ctx.AbortWithStatusJSON(http.StatusBadRequest, Body{
		Type:        InvalidRequest,
		Message:     message,
		FieldErrors: fieldErrors,
	})
}

func InternalServerError(ctx *gin.Context) {
	Abort(ctx, http.StatusInternalServerError, InternalError, "internal error")
}
