package handler

import (
	"net/http"

	"github.com/labstack/echo/v4"
	"github.com/rs/zerolog/log"
	"google.golang.org/grpc"
)

// ChatRequest represents an incoming chat message.
type ChatRequest struct {
	Message string `json:"message" validate:"required"`
	Model   string `json:"model,omitempty"`
}

// ChatResponse represents the gateway response.
type ChatResponse struct {
	Reply string `json:"reply"`
}

// ChatHandler handles chat-related HTTP requests.
type ChatHandler struct {
	grpcConn *grpc.ClientConn
}

// NewChatHandler creates a new ChatHandler with a gRPC connection.
func NewChatHandler(conn *grpc.ClientConn) *ChatHandler {
	return &ChatHandler{grpcConn: conn}
}

// Chat handles POST /api/v1/chat requests.
func (h *ChatHandler) Chat(c echo.Context) error {
	var req ChatRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "invalid request body",
		})
	}

	if req.Message == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "message is required",
		})
	}

	log.Info().
		Str("message", req.Message).
		Str("model", req.Model).
		Msg("chat request received")

	// TODO: Forward to agent service via gRPC
	// client := agentpb.NewAgentServiceClient(h.grpcConn)
	// resp, err := client.Chat(c.Request().Context(), &agentpb.ChatRequest{...})

	return c.JSON(http.StatusOK, ChatResponse{
		Reply: "gateway echo: " + req.Message,
	})
}
