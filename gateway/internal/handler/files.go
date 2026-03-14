package handler

import (
	"net/http"
	"strings"
	"time"

	"github.com/jikime/starnion/gateway/internal/storage"
	"github.com/labstack/echo/v4"
)

// FilesHandler serves uploaded files via short-lived MinIO presigned URLs.
// Requests must be JWT-authenticated (same middleware as other /api/v1 routes).
type FilesHandler struct {
	minio *storage.MinIO
}

// NewFilesHandler creates a new FilesHandler.
func NewFilesHandler(minio *storage.MinIO) *FilesHandler {
	return &FilesHandler{minio: minio}
}

// Get handles GET /api/v1/files/*key.
// Generates a 60-second presigned MinIO URL and redirects the client to it.
// The actual file bytes are streamed directly from MinIO — the gateway is
// not in the data path after the redirect.
func (h *FilesHandler) Get(c echo.Context) error {
	if h.minio == nil {
		return c.JSON(http.StatusServiceUnavailable, map[string]string{"error": "storage not configured"})
	}

	// Echo wildcard param includes a leading slash; strip it.
	objectKey := strings.TrimPrefix(c.Param("key"), "/")
	if objectKey == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "key is required"})
	}

	presigned, err := h.minio.PresignedURL(c.Request().Context(), objectKey, 60*time.Second)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to generate URL"})
	}

	return c.JSON(http.StatusOK, map[string]string{"url": presigned})
}
