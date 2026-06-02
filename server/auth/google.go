package auth

import (
	"context"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const googleJWKSEndpoint = "https://www.googleapis.com/oauth2/v3/certs"

type GoogleUser struct {
	Sub   string
	Email string
}

type GoogleVerifier struct {
	client *http.Client

	cacheTTL           time.Duration
	minRefreshInterval time.Duration

	mu            sync.RWMutex
	cachedAt      time.Time
	lastRefreshAt time.Time
	publicKeys    map[string]*rsa.PublicKey

	refreshMu sync.Mutex
}

func NewGoogleVerifier() *GoogleVerifier {
	return &GoogleVerifier{
		client:             &http.Client{Timeout: 10 * time.Second},
		cacheTTL:           1 * time.Hour,
		minRefreshInterval: 30 * time.Second,
		publicKeys:         map[string]*rsa.PublicKey{},
	}
}

func (v *GoogleVerifier) Verify(ctx context.Context, credential string, clientID string) (*GoogleUser, error) {
	claims := jwt.MapClaims{}
	if _, err := jwt.ParseWithClaims(credential, claims, func(token *jwt.Token) (interface{}, error) {
		if token.Method != jwt.SigningMethodRS256 {
			return nil, fmt.Errorf("unexpected signing method: %s", token.Method.Alg())
		}

		kid, ok := token.Header["kid"].(string)
		if !ok || kid == "" {
			return nil, errors.New("missing key id")
		}

		return v.key(ctx, kid)
	}, jwt.WithAudience(clientID)); err != nil {
		return nil, err
	}

	issuer, err := claims.GetIssuer()
	if err != nil {
		return nil, err
	}
	if issuer != "accounts.google.com" && issuer != "https://accounts.google.com" {
		return nil, errors.New("invalid issuer")
	}

	sub, ok := claims["sub"].(string)
	if !ok || sub == "" {
		return nil, errors.New("missing subject")
	}
	email, ok := claims["email"].(string)
	if !ok || email == "" {
		return nil, errors.New("missing email")
	}
	if !isEmailVerified(claims["email_verified"]) {
		return nil, errors.New("email is not verified")
	}

	return &GoogleUser{
		Sub:   sub,
		Email: email,
	}, nil
}

// isEmailVerified accepts the email_verified claim as either a JSON boolean or
// the string "true". Google ID tokens currently use a boolean, but some Google
// endpoints have historically encoded it as a string.
func isEmailVerified(claim interface{}) bool {
	switch v := claim.(type) {
	case bool:
		return v
	case string:
		return strings.EqualFold(v, "true")
	default:
		return false
	}
}

func (v *GoogleVerifier) key(ctx context.Context, kid string) (*rsa.PublicKey, error) {
	if key, fresh := v.lookup(kid); fresh && key != nil {
		return key, nil
	}

	if err := v.refresh(ctx); err != nil {
		return nil, err
	}

	if key, _ := v.lookup(kid); key != nil {
		return key, nil
	}
	return nil, errors.New("google public key not found")
}

// lookup returns the cached key (if any) for the given kid, plus whether the
// overall cache is still considered fresh (i.e. not past cacheTTL).
func (v *GoogleVerifier) lookup(kid string) (*rsa.PublicKey, bool) {
	v.mu.RLock()
	defer v.mu.RUnlock()
	fresh := time.Since(v.cachedAt) <= v.cacheTTL
	return v.publicKeys[kid], fresh
}

// refresh fetches the JWKS at most once per minRefreshInterval. Refreshes are
// serialized via refreshMu; reads of publicKeys happen under mu, so callers
// reading the cache are not blocked by the HTTP fetch.
func (v *GoogleVerifier) refresh(ctx context.Context) error {
	v.refreshMu.Lock()
	defer v.refreshMu.Unlock()

	v.mu.RLock()
	sinceLast := time.Since(v.lastRefreshAt)
	v.mu.RUnlock()
	if sinceLast < v.minRefreshInterval {
		return nil
	}

	// Record the attempt before the network call so failures are also
	// rate-limited (prevents JWKS hammering when Google is unreachable or the
	// attacker spams unknown kids).
	v.mu.Lock()
	v.lastRefreshAt = time.Now()
	v.mu.Unlock()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, googleJWKSEndpoint, nil)
	if err != nil {
		return err
	}
	res, err := v.client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("google jwks returned %s", res.Status)
	}

	var jwks struct {
		Keys []struct {
			Kid string `json:"kid"`
			Kty string `json:"kty"`
			Alg string `json:"alg"`
			Use string `json:"use"`
			N   string `json:"n"`
			E   string `json:"e"`
		} `json:"keys"`
	}
	if err := json.NewDecoder(res.Body).Decode(&jwks); err != nil {
		return err
	}

	keys := make(map[string]*rsa.PublicKey, len(jwks.Keys))
	for _, key := range jwks.Keys {
		if key.Kty != "RSA" || key.Alg != "RS256" || key.Use != "sig" {
			continue
		}
		publicKey, err := rsaPublicKey(key.N, key.E)
		if err != nil {
			return err
		}
		keys[key.Kid] = publicKey
	}
	if len(keys) == 0 {
		return errors.New("google jwks has no usable keys")
	}

	v.mu.Lock()
	v.publicKeys = keys
	v.cachedAt = time.Now()
	v.mu.Unlock()
	return nil
}

func rsaPublicKey(nRaw string, eRaw string) (*rsa.PublicKey, error) {
	nBytes, err := base64.RawURLEncoding.DecodeString(nRaw)
	if err != nil {
		return nil, err
	}
	eBytes, err := base64.RawURLEncoding.DecodeString(eRaw)
	if err != nil {
		return nil, err
	}

	e := 0
	for _, b := range eBytes {
		e = e<<8 + int(b)
	}
	if e == 0 {
		return nil, errors.New("invalid exponent")
	}

	return &rsa.PublicKey{
		N: new(big.Int).SetBytes(nBytes),
		E: e,
	}, nil
}
