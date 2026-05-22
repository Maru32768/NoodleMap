package auth

import (
	"errors"

	"github.com/google/uuid"
)

var (
	ErrInvalidPassword = errors.New("invalid password")
)

type User struct {
	ID      uuid.UUID `json:"id"`
	Email   string    `json:"email"`
	IsAdmin bool      `json:"isAdmin"`
}
