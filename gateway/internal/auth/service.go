package auth

import (
	"errors"
	"time"
)

var (
	ErrInvalidToken = errors.New("invalid or expired token")
	ErrUnauthorized = errors.New("unauthorized")
)

// Claims represents the decoded JWT claims.
type Claims struct {
	UserID string
	Email  string
	Exp    time.Time
}

// Service handles authentication and token validation.
type Service struct {
	secretKey string
}

// NewService creates a new auth service.
func NewService(secretKey string) *Service {
	return &Service{secretKey: secretKey}
}

// ValidateToken validates a bearer token and returns claims.
// TODO: Implement JWT validation logic.
func (s *Service) ValidateToken(token string) (*Claims, error) {
	if token == "" {
		return nil, ErrUnauthorized
	}

	// Placeholder: replace with real JWT parsing
	return &Claims{
		UserID: "placeholder-user-id",
		Email:  "user@example.com",
		Exp:    time.Now().Add(24 * time.Hour),
	}, nil
}
