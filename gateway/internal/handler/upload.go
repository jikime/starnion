package handler

import (
	"io"
	"net/http"

	"github.com/jikime/starnion/gateway/internal/storage"
	"github.com/labstack/echo/v4"
)

// UploadHandler handles file uploads to MinIO.
type UploadHandler struct {
	minio *storage.MinIO
}

// NewUploadHandler creates a new UploadHandler.
func NewUploadHandler(minio *storage.MinIO) *UploadHandler {
	return &UploadHandler{minio: minio}
}

// Upload handles POST /api/v1/upload.
// Accepts multipart form with a "file" field, uploads to MinIO,
// and returns {name, mime, url, size}.
func (h *UploadHandler) Upload(c echo.Context) error {
	if h.minio == nil {
		return c.JSON(http.StatusServiceUnavailable, map[string]string{"error": "storage not configured"})
	}

	fh, err := c.FormFile("file")
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "file field is required"})
	}

	src, err := fh.Open()
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to open file"})
	}
	defer src.Close()

	data, err := io.ReadAll(src)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to read file"})
	}

	contentType := fh.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	att, err := h.minio.Upload(c.Request().Context(), fh.Filename, contentType, data)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "upload failed: " + err.Error()})
	}

	return c.JSON(http.StatusOK, att)
}
