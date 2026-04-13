// Package media hosts the HTTP adapter for the images/audios
// domain. Sixteenth handler sub-package to migrate out of
// internal/adapter/handler.
//
// The CRUD endpoints delegate to a usecase; the heavy I/O
// endpoints (Upload, Transcribe, TTS, ServeFile,
// InternalUploadScreenshot) live in this package because they are
// tightly coupled to the request/response lifecycle — multipart
// form parsing, streaming downloads, and MinIO pass-through all
// want to stay on the adapter side of the boundary.
package media

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/labstack/echo/v4"
	"github.com/newstarnion/gateway/config"
	"github.com/newstarnion/gateway/internal/adapter/http/httpauth"
	"github.com/newstarnion/gateway/internal/domain"
	"github.com/newstarnion/gateway/internal/domain/entity"
	"github.com/newstarnion/gateway/internal/infrastructure/mediastore"
	mediausecase "github.com/newstarnion/gateway/internal/usecase/media"
	"go.uber.org/zap"
)

type Handler struct {
	uc     *mediausecase.UseCase
	store  *mediastore.Store
	cfg    *config.Config
	logger *zap.Logger
}

func NewHandler(uc *mediausecase.UseCase, store *mediastore.Store, cfg *config.Config, logger *zap.Logger) *Handler {
	return &Handler{uc: uc, store: store, cfg: cfg, logger: logger}
}

// Register mounts the protected media routes.
func (h *Handler) Register(protected *echo.Group) {
	// Image CRUD
	protected.GET("/images", h.listImages)
	protected.GET("/images/:id", h.getImage)
	protected.DELETE("/images/:id", h.deleteImage)

	// Audio CRUD
	protected.GET("/audios", h.listAudios)
	protected.GET("/audios/:id", h.getAudio)
	protected.GET("/audios/:id/transcript", h.getTranscript)
	protected.DELETE("/audios/:id", h.deleteAudio)

	// Audio utilities
	protected.POST("/audios/transcribe", h.transcribe)
	protected.POST("/audios/tts", h.tts)

	// Upload
	protected.POST("/upload", h.upload)
}

func unauthorized(c echo.Context) error {
	return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
}

// ── Image CRUD ───────────────────────────────────────────────────

func (h *Handler) listImages(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	page, _ := strconv.Atoi(c.QueryParam("page"))
	limit, _ := strconv.Atoi(c.QueryParam("limit"))
	result, err := h.uc.ListImages(c.Request().Context(), userID, page, limit)
	if err != nil {
		h.logger.Warn("media list images failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to fetch images"})
	}
	return c.JSON(http.StatusOK, map[string]any{
		"images": imagesToJSON(result.Images),
		"total":  result.Total,
		"page":   result.Page,
		"limit":  result.Limit,
	})
}

func (h *Handler) getImage(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	img, err := h.uc.GetImage(c.Request().Context(), userID, c.Param("id"))
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return c.JSON(http.StatusNotFound, map[string]string{"error": "image not found"})
		}
		h.logger.Warn("media get image failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to fetch image"})
	}
	return c.JSON(http.StatusOK, imageToMap(img))
}

func (h *Handler) deleteImage(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	if err := h.uc.DeleteImage(c.Request().Context(), userID, c.Param("id")); err != nil {
		h.logger.Warn("media delete image failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to delete image"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "deleted"})
}

// ── Audio CRUD ───────────────────────────────────────────────────

func (h *Handler) listAudios(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	page, _ := strconv.Atoi(c.QueryParam("page"))
	limit, _ := strconv.Atoi(c.QueryParam("limit"))
	result, err := h.uc.ListAudios(c.Request().Context(), userID, page, limit)
	if err != nil {
		h.logger.Warn("media list audios failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to fetch audios"})
	}
	return c.JSON(http.StatusOK, map[string]any{
		"audios": audiosToJSON(result.Audios),
		"total":  result.Total,
		"page":   result.Page,
		"limit":  result.Limit,
	})
}

func (h *Handler) getAudio(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	a, err := h.uc.GetAudio(c.Request().Context(), userID, c.Param("id"))
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return c.JSON(http.StatusNotFound, map[string]string{"error": "audio not found"})
		}
		h.logger.Warn("media get audio failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to fetch audio"})
	}
	return c.JSON(http.StatusOK, audioToMap(a))
}

func (h *Handler) getTranscript(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	a, err := h.uc.GetAudioTranscript(c.Request().Context(), userID, c.Param("id"))
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return c.JSON(http.StatusNotFound, map[string]string{"error": "audio not found"})
		}
		h.logger.Warn("media get transcript failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to fetch transcript"})
	}
	if a.Transcript == "" {
		return c.JSON(http.StatusOK, map[string]any{"id": a.ID, "transcript": nil})
	}
	return c.JSON(http.StatusOK, map[string]any{"id": a.ID, "transcript": a.Transcript})
}

func (h *Handler) deleteAudio(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	if err := h.uc.DeleteAudio(c.Request().Context(), userID, c.Param("id")); err != nil {
		h.logger.Warn("media delete audio failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to delete audio"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "deleted"})
}

// ── JSON mappers ────────────────────────────────────────────────

func imagesToJSON(rows []entity.Image) []map[string]any {
	out := make([]map[string]any, 0, len(rows))
	for _, img := range rows {
		out = append(out, imageToMap(img))
	}
	return out
}

func imageToMap(img entity.Image) map[string]any {
	var prompt, analysis any
	if img.Prompt != "" {
		prompt = img.Prompt
	}
	if img.Analysis != "" {
		analysis = img.Analysis
	}
	return map[string]any{
		"id":         img.ID,
		"url":        img.URL,
		"name":       img.Name,
		"mime":       img.MIME,
		"size":       img.Size,
		"source":     img.Source,
		"type":       img.Type,
		"prompt":     prompt,
		"analysis":   analysis,
		"created_at": img.CreatedAt,
	}
}

func audiosToJSON(rows []entity.Audio) []map[string]any {
	out := make([]map[string]any, 0, len(rows))
	for _, a := range rows {
		out = append(out, audioToMap(a))
	}
	return out
}

func audioToMap(a entity.Audio) map[string]any {
	var transcript any
	if a.Transcript != "" {
		transcript = a.Transcript
	}
	return map[string]any{
		"id":         a.ID,
		"url":        a.URL,
		"name":       a.Name,
		"mime":       a.MIME,
		"size":       a.Size,
		"duration":   a.Duration,
		"source":     a.Source,
		"type":       a.Type,
		"transcript": transcript,
		"created_at": a.CreatedAt,
	}
}
