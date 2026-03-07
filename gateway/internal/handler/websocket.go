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

var upgrader = websocket.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
	// Allow any origin; production should restrict this.
	CheckOrigin: func(r *http.Request) bool { return true },
}

// WebSocketHandler handles WebSocket upgrade requests.
type WebSocketHandler struct {
	hub     *wschat.Hub
	authSvc *auth.Service
}

// NewWebSocketHandler creates a WebSocketHandler.
func NewWebSocketHandler(hub *wschat.Hub, authSvc *auth.Service) *WebSocketHandler {
	return &WebSocketHandler{hub: hub, authSvc: authSvc}
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

	conn, err := upgrader.Upgrade(c.Response(), c.Request(), nil)
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
