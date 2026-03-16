package handler

import (
	"net/http"
	"strings"

	"github.com/gorilla/websocket"
	"github.com/jikime/starnion/gateway/internal/auth"
	"github.com/jikime/starnion/gateway/internal/wschat"
	"github.com/labstack/echo/v4"
	"github.com/rs/zerolog/log"
)

// WebSocketHandler handles WebSocket upgrade requests.
type WebSocketHandler struct {
	hub      *wschat.Hub
	authSvc  *auth.Service
	upgrader websocket.Upgrader
}

// NewWebSocketHandler creates a WebSocketHandler.
// allowedOrigins should come from the same CORS config used by the HTTP server
// (cfg.CORS.AllowedOrigins). An empty slice falls back to allowing any origin,
// which is acceptable for local dev but should not be used in production.
func NewWebSocketHandler(hub *wschat.Hub, authSvc *auth.Service, allowedOrigins []string) *WebSocketHandler {
	originSet := make(map[string]struct{}, len(allowedOrigins))
	for _, o := range allowedOrigins {
		originSet[strings.TrimRight(o, "/")] = struct{}{}
	}

	checkOrigin := func(r *http.Request) bool {
		if len(originSet) == 0 {
			return true // dev mode: no restrictions
		}
		origin := strings.TrimRight(r.Header.Get("Origin"), "/")
		_, ok := originSet[origin]
		return ok
	}

	return &WebSocketHandler{
		hub:     hub,
		authSvc: authSvc,
		upgrader: websocket.Upgrader{
			ReadBufferSize:  4096,
			WriteBufferSize: 4096,
			CheckOrigin:     checkOrigin,
		},
	}
}

// Connect handles GET /ws — upgrades the HTTP connection to WebSocket.
//
// Authentication: Bearer token in Authorization header or "token" query param.
func (h *WebSocketHandler) Connect(c echo.Context) error {
	tokenStr := bearerToken(c)
	if tokenStr == "" {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "missing token"})
	}

	claims, err := h.authSvc.ValidateToken(tokenStr)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "invalid token"})
	}

	conn, err := h.upgrader.Upgrade(c.Response(), c.Request(), nil)
	if err != nil {
		log.Warn().Err(err).Str("user_id", claims.UserID).Msg("ws: upgrade failed")
		return nil // upgrader already wrote the error response
	}

	log.Info().Str("user_id", claims.UserID).Str("platform", claims.Platform).Msg("ws: client connected")
	wschat.NewClient(h.hub, claims.UserID, conn)
	return nil
}

// bearerToken extracts the JWT from the Authorization header or query param.
func bearerToken(c echo.Context) string {
	if v := c.QueryParam("token"); v != "" {
		return v
	}
	auth := c.Request().Header.Get("Authorization")
	if strings.HasPrefix(auth, "Bearer ") {
		return strings.TrimPrefix(auth, "Bearer ")
	}
	return ""
}
