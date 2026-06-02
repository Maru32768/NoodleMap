package auth

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const (
	testGoogleClientID = "google-client-id"
	testGoogleKeyID    = "test-key"
)

func TestGoogleVerifierVerify(t *testing.T) {
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("GenerateKey: %v", err)
	}
	verifier := newTestGoogleVerifier(privateKey)

	cases := []struct {
		name      string
		mutate    func(jwt.MapClaims)
		wantUser  *GoogleUser
		wantError string
	}{
		{
			name: "valid token",
			wantUser: &GoogleUser{
				Sub:   "google-sub",
				Email: "user@example.com",
			},
		},
		{
			name: "invalid audience",
			mutate: func(claims jwt.MapClaims) {
				claims["aud"] = "other-client-id"
			},
			wantError: "aud",
		},
		{
			name: "invalid issuer",
			mutate: func(claims jwt.MapClaims) {
				claims["iss"] = "https://example.com"
			},
			wantError: "invalid issuer",
		},
		{
			name: "missing subject",
			mutate: func(claims jwt.MapClaims) {
				delete(claims, "sub")
			},
			wantError: "missing subject",
		},
		{
			name: "missing email",
			mutate: func(claims jwt.MapClaims) {
				delete(claims, "email")
			},
			wantError: "missing email",
		},
		{
			name: "unverified email",
			mutate: func(claims jwt.MapClaims) {
				claims["email_verified"] = false
			},
			wantError: "email is not verified",
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			claims := testGoogleClaims()
			if c.mutate != nil {
				c.mutate(claims)
			}
			credential := signTestGoogleToken(t, privateKey, testGoogleKeyID, claims)

			user, err := verifier.Verify(context.Background(), credential, testGoogleClientID)
			if c.wantError != "" {
				assertErrorContains(t, err, c.wantError)
				return
			}
			if err != nil {
				t.Fatalf("Verify: %v", err)
			}
			if user.Sub != c.wantUser.Sub || user.Email != c.wantUser.Email {
				t.Fatalf("Verify user = %+v, want %+v", user, c.wantUser)
			}
		})
	}
}

func TestGoogleVerifierVerifyRejectsUnsignedToken(t *testing.T) {
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("GenerateKey: %v", err)
	}
	verifier := newTestGoogleVerifier(privateKey)

	token := jwt.NewWithClaims(jwt.SigningMethodNone, testGoogleClaims())
	token.Header["kid"] = testGoogleKeyID
	credential, err := token.SignedString(jwt.UnsafeAllowNoneSignatureType)
	if err != nil {
		t.Fatalf("SignedString: %v", err)
	}

	_, err = verifier.Verify(context.Background(), credential, testGoogleClientID)
	assertErrorContains(t, err, "unexpected signing method")
}

func TestGoogleVerifierVerifyRejectsEmptySignature(t *testing.T) {
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("GenerateKey: %v", err)
	}
	verifier := newTestGoogleVerifier(privateKey)

	credential := signTestGoogleToken(t, privateKey, testGoogleKeyID, testGoogleClaims())
	parts := strings.Split(credential, ".")
	if len(parts) != 3 {
		t.Fatalf("signed token has %d parts, want 3", len(parts))
	}
	credential = parts[0] + "." + parts[1] + "."

	_, err = verifier.Verify(context.Background(), credential, testGoogleClientID)
	if err == nil {
		t.Fatal("Verify should reject token with empty signature")
	}
}

func TestGoogleVerifierVerifyRejectsMissingAndUnknownKeyID(t *testing.T) {
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("GenerateKey: %v", err)
	}
	verifier := newTestGoogleVerifier(privateKey)

	missingKid := signTestGoogleToken(t, privateKey, "", testGoogleClaims())
	_, err = verifier.Verify(context.Background(), missingKid, testGoogleClientID)
	assertErrorContains(t, err, "missing key id")

	unknownKid := signTestGoogleToken(t, privateKey, "unknown-key", testGoogleClaims())
	_, err = verifier.Verify(context.Background(), unknownKid, testGoogleClientID)
	assertErrorContains(t, err, "google public key not found")
}

func TestIsEmailVerified(t *testing.T) {
	cases := []struct {
		name  string
		claim interface{}
		want  bool
	}{
		{"bool true", true, true},
		{"bool false", false, false},
		{"string true", "true", true},
		{"string True", "True", true},
		{"string false", "false", false},
		{"empty string", "", false},
		{"missing", nil, false},
		{"unexpected type", 1, false},
	}
	for _, c := range cases {
		if got := isEmailVerified(c.claim); got != c.want {
			t.Errorf("isEmailVerified(%v) = %v, want %v", c.claim, got, c.want)
		}
	}
}

func newTestGoogleVerifier(privateKey *rsa.PrivateKey) *GoogleVerifier {
	return &GoogleVerifier{
		cacheTTL:           time.Hour,
		minRefreshInterval: time.Hour,
		cachedAt:           time.Now(),
		lastRefreshAt:      time.Now(),
		publicKeys: map[string]*rsa.PublicKey{
			testGoogleKeyID: &privateKey.PublicKey,
		},
	}
}

func testGoogleClaims() jwt.MapClaims {
	now := time.Now()
	return jwt.MapClaims{
		"iss":            "https://accounts.google.com",
		"sub":            "google-sub",
		"aud":            testGoogleClientID,
		"email":          "user@example.com",
		"email_verified": true,
		"iat":            now.Unix(),
		"exp":            now.Add(time.Hour).Unix(),
	}
}

func signTestGoogleToken(t *testing.T, privateKey *rsa.PrivateKey, kid string, claims jwt.MapClaims) string {
	t.Helper()

	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	if kid != "" {
		token.Header["kid"] = kid
	}
	credential, err := token.SignedString(privateKey)
	if err != nil {
		t.Fatalf("SignedString: %v", err)
	}
	return credential
}

func assertErrorContains(t *testing.T, err error, want string) {
	t.Helper()

	if err == nil {
		t.Fatalf("error is nil, want containing %q", want)
	}
	if !strings.Contains(err.Error(), want) {
		t.Fatalf("error = %q, want containing %q", err.Error(), want)
	}
}
