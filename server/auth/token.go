package auth

import (
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

type token struct {
	claims tokenClaims
}

type tokenClaims struct {
	userId uuid.UUID
}

func issueToken(userId uuid.UUID, secret string) (string, error) {
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"aud": userId.String(),
	})
	return token.SignedString([]byte(secret))
}

func parseToken(t, secret string) (*token, error) {
	parsed, err := jwt.Parse(t, func(token *jwt.Token) (interface{}, error) {
		return []byte(secret), nil
	})
	if err != nil {
		return nil, err
	}

	aud, err := parsed.Claims.GetAudience()
	if err != nil {
		return nil, err
	}

	userId, err := uuid.Parse(aud[0])
	if err != nil {
		return nil, err
	}

	return &token{
		claims: tokenClaims{
			userId: userId,
		},
	}, nil
}
