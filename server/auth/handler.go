package auth

import (
	"database/sql"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"server/httperrors"
	"server/infra/db"
)

const (
	cookieName = "noodle_map_session"
	sessionTTL = 30 * 24 * time.Hour
	// sessionRefreshInterval bounds how often a sliding session is actually
	// re-persisted. ExtendSession only writes when the session was last extended
	// more than this long ago, so most authenticated requests perform no write.
	// It must stay well below sessionTTL so an active session never lapses.
	sessionRefreshInterval = 12 * time.Hour
)

type Config struct {
	GoogleOAuthClientID string
	AdminEmail          string
	CookieSecure        bool
}

type Handler struct {
	store          *db.Store
	googleClientID string
	adminEmail     string
	cookieSecure   bool
	googleVerifier *GoogleVerifier
}

func NewHandler(store *db.Store, config Config) *Handler {
	return &Handler{
		store:          store,
		googleClientID: config.GoogleOAuthClientID,
		adminEmail:     strings.ToLower(config.AdminEmail),
		cookieSecure:   config.CookieSecure,
		googleVerifier: NewGoogleVerifier(),
	}
}

func (h *Handler) Middleware() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		if !requiresAuthentication(ctx.Request.URL.Path) {
			ctx.Next()
			return
		}

		h.authenticateRequest(ctx)
		if ctx.IsAborted() {
			return
		}

		ctx.Next()
	}
}

func (h *Handler) authenticateRequest(ctx *gin.Context) {
	token, err := ctx.Cookie(cookieName)
	if err != nil {
		httperrors.Abort(ctx, http.StatusUnauthorized, httperrors.AuthenticationRequired, "authentication required")
		return
	}

	user, extended, err := h.authenticate(ctx, token)
	if err != nil {
		httperrors.Abort(ctx, http.StatusUnauthorized, httperrors.AuthenticationRequired, "authentication required")
		return
	}
	// Refresh the cookie only when the session was actually re-persisted, so the
	// cookie and the stored session share the same sliding expiry.
	if extended {
		h.setSessionCookie(ctx, token, int(sessionTTL.Seconds()))
	}

	ctx.Set("user", user)
}

func requiresAuthentication(path string) bool {
	if !strings.HasPrefix(path, "/api/v1/auth/") {
		return false
	}
	switch path {
	case "/api/v1/auth/google", "/api/v1/auth/logout":
		return false
	}
	return true
}

func (h *Handler) Me(ctx *gin.Context) {
	user, err := GetContextUser(ctx)
	if err != nil {
		httperrors.InternalServerError(ctx)
		return
	}

	ctx.JSON(http.StatusOK, user)
}

func (h *Handler) GoogleAuth(ctx *gin.Context) {
	type request struct {
		Credential string `json:"credential"`
	}
	var req request
	if err := ctx.BindJSON(&req); err != nil {
		httperrors.BadRequest(ctx, "invalid request")
		return
	}

	user, err := h.googleAuth(ctx, req.Credential)
	if err != nil {
		log.Printf("google auth error: %v", err)
		httperrors.Abort(ctx, http.StatusBadRequest, httperrors.GoogleAuthFailed, "failed to authenticate with Google")
		return
	}

	token, err := newSessionToken()
	if err != nil {
		log.Printf("new session token error: %v", err)
		httperrors.Abort(ctx, http.StatusInternalServerError, httperrors.SessionCreationFailed, "failed to create session")
		return
	}
	if err := h.store.InsertSession(ctx, db.InsertSessionParams{
		ID:        uuid.New(),
		UserID:    user.ID,
		TokenHash: sessionTokenHash(token),
		UserAgent: sql.NullString{String: ctx.GetHeader("User-Agent"), Valid: ctx.GetHeader("User-Agent") != ""},
		ExpiresAt: time.Now().UTC().Add(sessionTTL),
	}); err != nil {
		log.Printf("insert session error: %v", err)
		httperrors.Abort(ctx, http.StatusInternalServerError, httperrors.SessionCreationFailed, "failed to create session")
		return
	}
	h.setSessionCookie(ctx, token, int(sessionTTL.Seconds()))

	ctx.JSON(http.StatusOK, gin.H{"user": user})
}

func (h *Handler) Logout(ctx *gin.Context) {
	if cookie, err := ctx.Cookie(cookieName); err == nil {
		if err := h.store.DeleteSessionByTokenHash(ctx, sessionTokenHash(cookie)); err != nil {
			log.Printf("logout: delete session: %v", err)
		}
	}
	h.setSessionCookie(ctx, "", -1)
	ctx.Status(http.StatusOK)
}

// authenticate validates the session token and slides its expiry. The returned
// bool reports whether the session was actually re-persisted this call (throttled
// by sessionRefreshInterval), so the caller can refresh the cookie in lockstep.
func (h *Handler) authenticate(ctx *gin.Context, token string) (*User, bool, error) {
	now := time.Now().UTC()
	session, err := h.store.FindValidSessionByTokenHash(ctx, db.FindValidSessionByTokenHashParams{
		TokenHash: sessionTokenHash(token),
		Now:       now,
	})
	if err != nil {
		return nil, false, err
	}
	extended := false
	if rows, err := h.store.ExtendSession(ctx, db.ExtendSessionParams{
		ID:          session.ID,
		ExpiresAt:   now.Add(sessionTTL),
		StaleBefore: now.Add(sessionTTL - sessionRefreshInterval),
	}); err != nil {
		log.Printf("extend session: %v", err)
	} else {
		extended = rows > 0
	}

	return h.authUser(session.UserID, session.Email), extended, nil
}

func (h *Handler) googleAuth(ctx *gin.Context, credential string) (*User, error) {
	googleUser, err := h.googleVerifier.Verify(ctx, credential, h.googleClientID)
	if err != nil {
		return nil, err
	}

	user, err := h.store.FindUserByGoogleSub(ctx, sql.NullString{String: googleUser.Sub, Valid: true})
	if err == nil {
		return h.authUser(user.ID, user.Email), nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}

	userID := uuid.New()
	if err := h.store.InsertUser(ctx, db.InsertUserParams{
		ID:        userID,
		Email:     googleUser.Email,
		GoogleSub: sql.NullString{String: googleUser.Sub, Valid: true},
	}); err != nil {
		// A concurrent first-time login for the same google_sub may have
		// inserted the row already; fall back to the existing record.
		if existing, lookupErr := h.store.FindUserByGoogleSub(ctx, sql.NullString{String: googleUser.Sub, Valid: true}); lookupErr == nil {
			return h.authUser(existing.ID, existing.Email), nil
		}
		return nil, err
	}

	return h.authUser(userID, googleUser.Email), nil
}

func (h *Handler) isAdminEmail(email string) bool {
	return h.adminEmail != "" && strings.ToLower(email) == h.adminEmail
}

func (h *Handler) authUser(id uuid.UUID, email string) *User {
	return &User{ID: id, Email: email, IsAdmin: h.isAdminEmail(email)}
}

func (h *Handler) setSessionCookie(ctx *gin.Context, token string, maxAge int) {
	ctx.SetSameSite(http.SameSiteLaxMode)
	ctx.SetCookie(cookieName, token, maxAge, "/", "", h.cookieSecure, true)
}
