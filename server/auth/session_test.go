package auth

import "testing"

func TestNewSessionToken(t *testing.T) {
	token, err := newSessionToken()
	if err != nil {
		t.Fatalf("newSessionToken: %v", err)
	}
	if token == "" {
		t.Fatal("token should not be empty")
	}

	other, err := newSessionToken()
	if err != nil {
		t.Fatalf("newSessionToken second call: %v", err)
	}
	if token == other {
		t.Fatal("two session tokens should not be equal")
	}
}

func TestSessionTokenHash(t *testing.T) {
	token := "session-token"
	hash := sessionTokenHash(token)

	if hash == "" {
		t.Fatal("hash should not be empty")
	}
	if hash == token {
		t.Fatal("hash should not equal the raw token")
	}
	if hash != sessionTokenHash(token) {
		t.Fatal("hash should be deterministic")
	}
	if hash == sessionTokenHash("other-token") {
		t.Fatal("different tokens should not hash to the same value")
	}
}
