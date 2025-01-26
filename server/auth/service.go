package auth

import (
	"context"
	"database/sql"
	"errors"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"net/mail"
	"server/infra"
)

var (
	ErrInvalidPassword = errors.New("invalid password")
)

type Service struct {
	store  *infra.Store
	secret string
}

type User struct {
	ID      uuid.UUID `json:"id"`
	Email   string    `json:"email"`
	IsAdmin bool      `json:"isAdmin"`
}

func NewService(store *infra.Store, secret string) *Service {
	return &Service{
		store:  store,
		secret: secret,
	}
}

// TODO replace with gin-jwt

func (s *Service) Authenticate(ctx context.Context, token string) (*User, error) {
	parsedToken, err := parseToken(token, s.secret)
	if err != nil {
		return nil, err
	}

	user, err := s.store.FindUserById(ctx, parsedToken.claims.userId)
	if err != nil {
		return nil, err
	}

	return &User{ID: user.ID, Email: user.Email, IsAdmin: user.IsAdmin}, nil
}

func (s *Service) Login(ctx context.Context, email string, password string) (*User, string, error) {
	user, err := s.store.FindUserByEmail(ctx, email)
	if err != nil {
		return nil, "", err
	}

	if !verifyPassword(user.Password, password, user.Salt) {
		return nil, "", ErrInvalidPassword
	}

	storedToken, err := s.store.FindTokenByUserId(ctx, user.ID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			issuedToken, err := issueToken(user.ID, s.secret)
			if err != nil {
				return nil, "", err
			}

			if err := s.store.InsertToken(ctx, infra.InsertTokenParams{ID: uuid.New(), UserID: user.ID, Token: issuedToken}); err != nil {
				return nil, "", err
			}
			return &User{ID: user.ID, Email: user.Email, IsAdmin: user.IsAdmin}, issuedToken, nil
		}

		return nil, "", err
	}
	return &User{ID: user.ID, Email: user.Email, IsAdmin: user.IsAdmin}, storedToken, nil
}

func (s *Service) Logout(ctx context.Context, userId uuid.UUID) error {
	if err := s.store.DeleteTokenByUserId(ctx, userId); err != nil {
		return err
	}
	return nil
}

func (s *Service) Register(ctx context.Context, emailRaw string, password string) (*User, string, error) {
	address, err := mail.ParseAddress(emailRaw)
	if err != nil {
		return nil, "", errors.New("invalid email format")
	}
	email := address.Address

	salt := uuid.New().String()
	hash, err := hashPassword(password, salt)
	if err != nil {
		return nil, "", err
	}

	userId := uuid.New()
	tokenString, err := issueToken(userId, s.secret)
	if err != nil {
		return nil, "", err
	}
	isAdmin := false

	if err := s.store.ExecTx(ctx, func(store *infra.Store) error {
		if err := store.InsertUser(ctx, infra.InsertUserParams{ID: userId, Email: email, Password: hash, Salt: salt, IsAdmin: isAdmin}); err != nil {
			return err
		}

		if err := store.InsertToken(ctx, infra.InsertTokenParams{
			ID:     uuid.New(),
			UserID: userId,
			Token:  tokenString,
		}); err != nil {
			return err
		}

		return nil
	}); err != nil {
		return nil, "", err
	}

	return &User{ID: userId, Email: email, IsAdmin: isAdmin}, tokenString, nil
}

func hashPassword(password string, salt string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password+salt), bcrypt.DefaultCost)
	return string(hash), err
}

func verifyPassword(hash, password, salt string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password+salt))
	return err == nil
}

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
