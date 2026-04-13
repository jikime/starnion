// Package httpauth holds HTTP-level authentication primitives that are
// shared across every adapter in internal/adapter/http/*. It is the first
// step in splitting the monolithic `handler` package into domain-scoped
// subpackages: each sub-handler imports httpauth for JWT claims + user ID
// extraction instead of relying on package-local helpers that can only
// exist in a single Go package.
//
// The package intentionally has no dependencies on database, config, or
// gRPC — it only knows about JWT tokens and echo.Context.
package httpauth

import (
	"errors"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
)

// Claims is the gateway's bearer-token payload. The gateway's JWTMiddleware
// stores a `*Claims` on echo.Context under the key "user"; downstream
// handlers call UserIDFromContext to recover the authenticated user.
type Claims struct {
	UserID string `json:"user_id"`
	jwt.RegisteredClaims
}

// UserIDFromContext pulls the parsed JWT claims off an echo.Context and
// returns the authenticated user's UUID. It is the single entry point
// that every sub-handler uses so claim-layout changes propagate from one
// place.
func UserIDFromContext(c echo.Context) (uuid.UUID, error) {
	tokVal := c.Get("user")
	if tokVal == nil {
		return uuid.Nil, errors.New("httpauth: no token in context")
	}
	token, ok := tokVal.(*jwt.Token)
	if !ok || token == nil {
		return uuid.Nil, errors.New("httpauth: token in context is not *jwt.Token")
	}
	claims, ok := token.Claims.(*Claims)
	if !ok {
		return uuid.Nil, errors.New("httpauth: token claims are not *httpauth.Claims")
	}
	return uuid.Parse(claims.UserID)
}
