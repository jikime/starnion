package health

import (
	"net/http"

	"github.com/labstack/echo/v4"
	agentgrpc "github.com/newstarnion/gateway/internal/infrastructure/grpc"
)

type Handler struct {
	agentClient *agentgrpc.AgentClient
}

func NewHandler(agentClient *agentgrpc.AgentClient) *Handler {
	return &Handler{agentClient: agentClient}
}

func (h *Handler) Check(c echo.Context) error {
	agentStatus := "disconnected"
	if h.agentClient != nil {
		agentStatus = "connected"
	}
	return c.JSON(http.StatusOK, map[string]string{
		"status":  "ok",
		"service": "newstarnion-gateway",
		"agent":   agentStatus,
	})
}
