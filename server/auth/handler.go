package auth

import (
	"database/sql"
	"errors"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"net/http"
	"net/mail"
	"server/infra/db"
	"strings"
)

type Handler struct {
	store  *db.Store
	secret string
}

func NewHandler(store *db.Store, secret string) *Handler {
	return &Handler{
		store:  store,
		secret: secret,
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

	user, err := h.authenticate(ctx, token)
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

	user, token, err := h.register(ctx, req.Email, req.Password)
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

	user, token, err := h.login(ctx, req.Email, req.Password)
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

	if err := h.store.DeleteTokenByUserId(ctx, user.ID); err != nil {
		ctx.AbortWithError(http.StatusInternalServerError, err)
		return
	}

	ctx.Status(http.StatusOK)
}

func (h *Handler) authenticate(ctx *gin.Context, token string) (*User, error) {
	parsedToken, err := parseToken(token, h.secret)
	if err != nil {
		return nil, err
	}

	user, err := h.store.FindUserById(ctx, parsedToken.claims.userId)
	if err != nil {
		return nil, err
	}

	return &User{ID: user.ID, Email: user.Email, IsAdmin: user.IsAdmin}, nil
}

func (h *Handler) login(ctx *gin.Context, email string, password string) (*User, string, error) {
	user, err := h.store.FindUserByEmail(ctx, email)
	if err != nil {
		return nil, "", err
	}

	if !verifyPassword(user.Password, password, user.Salt) {
		return nil, "", ErrInvalidPassword
	}

	storedToken, err := h.store.FindTokenByUserId(ctx, user.ID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			issuedToken, err := issueToken(user.ID, h.secret)
			if err != nil {
				return nil, "", err
			}

			if err := h.store.InsertToken(ctx, db.InsertTokenParams{ID: uuid.New(), UserID: user.ID, Token: issuedToken}); err != nil {
				return nil, "", err
			}
			return &User{ID: user.ID, Email: user.Email, IsAdmin: user.IsAdmin}, issuedToken, nil
		}

		return nil, "", err
	}
	return &User{ID: user.ID, Email: user.Email, IsAdmin: user.IsAdmin}, storedToken, nil
}

func (h *Handler) register(ctx *gin.Context, emailRaw string, password string) (*User, string, error) {
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
	tokenString, err := issueToken(userId, h.secret)
	if err != nil {
		return nil, "", err
	}
	isAdmin := false

	if err := h.store.Tx(ctx, func(store *db.Store) error {
		if err := store.InsertUser(ctx, db.InsertUserParams{ID: userId, Email: email, Password: hash, Salt: salt, IsAdmin: isAdmin}); err != nil {
			return err
		}

		if err := store.InsertToken(ctx, db.InsertTokenParams{
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
