package handler

import (
	"net/http"

	"github.com/labstack/echo/v4"
	agentgrpc "github.com/newstarnion/gateway/internal/infrastructure/grpc"
)

type HealthHandler struct {
	agentClient *agentgrpc.AgentClient
}

func NewHealthHandler(agentClient *agentgrpc.AgentClient) *HealthHandler {
	return &HealthHandler{agentClient: agentClient}
}

func (h *HealthHandler) Check(c echo.Context) error {
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
