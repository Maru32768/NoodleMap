package auth

import "testing"

func TestRequiresAuthentication(t *testing.T) {
	cases := []struct {
		path string
		want bool
	}{
		{"/api/v1/auth/me", true},
		{"/api/v1/auth/restaurants", true},
		{"/api/v1/auth/restaurants/123", true},
		{"/api/v1/auth/google", false},
		{"/api/v1/auth/logout", false},
		{"/api/v1/restaurants", false},
		{"/health", false},
	}
	for _, c := range cases {
		if got := requiresAuthentication(c.path); got != c.want {
			t.Errorf("requiresAuthentication(%q) = %v, want %v", c.path, got, c.want)
		}
	}
}

func TestIsAdminEmail(t *testing.T) {
	h := &Handler{adminEmail: "admin@example.com"}

	cases := []struct {
		email string
		want  bool
	}{
		{"admin@example.com", true},
		{"ADMIN@EXAMPLE.COM", true},
		{"Admin@Example.Com", true},
		{"other@example.com", false},
		{"", false},
	}
	for _, c := range cases {
		if got := h.isAdminEmail(c.email); got != c.want {
			t.Errorf("isAdminEmail(%q) = %v, want %v", c.email, got, c.want)
		}
	}

	empty := &Handler{adminEmail: ""}
	if empty.isAdminEmail("admin@example.com") {
		t.Error("empty adminEmail should not grant admin")
	}
}
