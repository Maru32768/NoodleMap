package auth

import (
	"context"
	"errors"
)

func GetContextUser(ctx context.Context) (*User, error) {
	user, ok := ctx.Value("user").(*User)
	if !ok {
		return nil, errors.New("invalid context")
	}

	return user, nil
}
