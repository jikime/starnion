package auth

import (
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

var (
	ErrInvalidToken = errors.New("invalid or expired token")
	ErrUnauthorized = errors.New("unauthorized")
)

// Claims represents the decoded JWT claims.
type Claims struct {
	UserID   string
	Platform string
	Exp      time.Time
}

// jwtClaims is the internal JWT claims structure.
type jwtClaims struct {
	jwt.RegisteredClaims
	Platform string `json:"plat,omitempty"`
}

// Service handles authentication and token validation.
type Service struct {
	secretKey []byte
}

// NewService creates a new auth service.
func NewService(secretKey string) *Service {
	return &Service{secretKey: []byte(secretKey)}
}

// IssueToken creates a signed JWT (HS256) for the given user and platform.
// Token is valid for 30 days.
func (s *Service) IssueToken(userID, platform string) (string, error) {
	now := time.Now()
	claims := jwtClaims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(30 * 24 * time.Hour)),
		},
		Platform: platform,
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString(s.secretKey)
	if err != nil {
		return "", fmt.Errorf("sign token: %w", err)
	}
	return signed, nil
}

// ValidateToken parses and validates a JWT string, returning decoded claims.
func (s *Service) ValidateToken(tokenStr string) (*Claims, error) {
	if tokenStr == "" {
		return nil, ErrUnauthorized
	}

	token, err := jwt.ParseWithClaims(tokenStr, &jwtClaims{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return s.secretKey, nil
	})
	if err != nil || !token.Valid {
		return nil, ErrInvalidToken
	}

	c, ok := token.Claims.(*jwtClaims)
	if !ok {
		return nil, ErrInvalidToken
	}

	return &Claims{
		UserID:   c.Subject,
		Platform: c.Platform,
		Exp:      c.ExpiresAt.Time,
	}, nil
}
