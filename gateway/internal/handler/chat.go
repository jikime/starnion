package handler

import (
	"net/http"

	jikiv1 "github.com/jikime/jiki/gateway/gen/jiki/v1"
	"github.com/labstack/echo/v4"
	"github.com/rs/zerolog/log"
	"google.golang.org/grpc"
)

// ChatRequest represents an incoming chat message.
type ChatRequest struct {
	UserID  string `json:"user_id" validate:"required"`
	Message string `json:"message" validate:"required"`
	Model   string `json:"model,omitempty"`
}

// ChatResponse represents the gateway response.
type ChatResponse struct {
	Reply string `json:"reply"`
}

// ChatHandler handles chat-related HTTP requests.
type ChatHandler struct {
	grpcClient jikiv1.AgentServiceClient
}

// NewChatHandler creates a new ChatHandler with a gRPC connection.
func NewChatHandler(conn *grpc.ClientConn) *ChatHandler {
	return &ChatHandler{
		grpcClient: jikiv1.NewAgentServiceClient(conn),
	}
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

	if req.UserID == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "user_id is required",
		})
	}

	log.Info().
		Str("user_id", req.UserID).
		Str("message", req.Message).
		Msg("chat request received")

	resp, err := h.grpcClient.Chat(c.Request().Context(), &jikiv1.ChatRequest{
		UserId:  req.UserID,
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
