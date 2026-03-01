package middleware

import (
	"github.com/labstack/echo/v4"
	echomw "github.com/labstack/echo/v4/middleware"
)

// CORSConfig returns an Echo CORS middleware configured with the provided
// allowed origins, methods, and headers.
func CORSConfig(origins, methods, headers []string) echo.MiddlewareFunc {
	return echomw.CORSWithConfig(echomw.CORSConfig{
		AllowOrigins:     origins,
		AllowMethods:     methods,
		AllowHeaders:     headers,
		AllowCredentials: true,
		MaxAge:           3600,
	})
}
