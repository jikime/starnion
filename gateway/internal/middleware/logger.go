package middleware

import (
	"time"

	"github.com/labstack/echo/v4"
	"github.com/rs/zerolog/log"
)

// RequestLogger returns an Echo middleware that logs each HTTP request via
// zerolog so the entries are captured by the in-memory logbuf and visible in
// the web UI monitoring page.
//
// Skips health-check and log-streaming paths to keep the buffer clean.
func RequestLogger() echo.MiddlewareFunc {
	skip := map[string]bool{
		"/healthz":              true,
		"/api/v1/logs/stream":   true,
		"/api/v1/logs":          true,
	}

	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			if skip[c.Path()] {
				return next(c)
			}

			start := time.Now()
			err := next(c)

			req := c.Request()
			res := c.Response()
			latency := time.Since(start)

			ev := log.Info().
				Str("method", req.Method).
				Str("path", req.URL.Path).
				Int("status", res.Status).
				Str("latency", latency.String()).
				Str("component", "http")

			if err != nil {
				ev = ev.Err(err)
			}
			ev.Msg("request")

			return err
		}
	}
}
