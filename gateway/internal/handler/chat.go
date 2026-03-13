package handler

import (
	"net/http"

	starnionv1 "github.com/jikime/starnion/gateway/gen/starnion/v1"
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
	grpcClient starnionv1.AgentServiceClient
}

// NewChatHandler creates a new ChatHandler with a gRPC connection.
func NewChatHandler(conn *grpc.ClientConn) *ChatHandler {
	return &ChatHandler{
		grpcClient: starnionv1.NewAgentServiceClient(conn),
	}
}

// Chat handles POST /api/v1/chat requests.
func (h *ChatHandler) Chat(c echo.Context) error {
	userID, ok := c.Get("userID").(string)
	if !ok || userID == "" {
		return c.JSON(http.StatusUnauthorized, map[string]string{
			"error": "unauthorized",
		})
	}

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
		Str("user_id", userID).
		Str("message", req.Message).
		Msg("chat request received")

	resp, err := h.grpcClient.Chat(c.Request().Context(), &starnionv1.ChatRequest{
		UserId:  userID,
		Message: req.Message,
		Model:   req.Model,
	})
	if err != nil {
		log.Error().Err(err).Msg("gRPC chat failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "agent service unavailable",
		})
	}

	return c.JSON(http.StatusOK, ChatResponse{
		Reply: resp.Content,
	})
}
