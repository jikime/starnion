package middleware

import (
	"net/http"
	"strings"

	"github.com/jikime/starnion/gateway/internal/auth"
	"github.com/labstack/echo/v4"
)

// JWTAuth creates an Echo middleware that validates Bearer tokens.
// On success it stores the authenticated userID in the echo context under key "userID".
func JWTAuth(authSvc *auth.Service) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			tokenStr := bearerToken(c)
			if tokenStr == "" {
				return c.JSON(http.StatusUnauthorized, map[string]string{"error": "authentication required"})
			}
			claims, err := authSvc.ValidateToken(tokenStr)
			if err != nil {
				return c.JSON(http.StatusUnauthorized, map[string]string{"error": "invalid or expired token"})
			}
			c.Set("userID", claims.UserID)
			return next(c)
		}
	}
}

// bearerToken extracts the token from Authorization header or ?token= query param.
func bearerToken(c echo.Context) string {
	// Authorization: Bearer <token>
	h := c.Request().Header.Get("Authorization")
	if strings.HasPrefix(h, "Bearer ") {
		return strings.TrimPrefix(h, "Bearer ")
	}
	// Fallback: ?token=<token>
	return c.QueryParam("token")
}
