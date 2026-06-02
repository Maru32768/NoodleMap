package auth

import "github.com/google/uuid"

type User struct {
	ID      uuid.UUID `json:"id"`
	Email   string    `json:"email"`
	IsAdmin bool      `json:"isAdmin"`
}
