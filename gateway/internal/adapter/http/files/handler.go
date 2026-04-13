// Package files hosts the HTTP adapter for the unified files
// domain. Seventeenth handler sub-package to migrate out of
// internal/adapter/handler.
package files

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/newstarnion/gateway/config"
	"github.com/newstarnion/gateway/internal/adapter/http/httpauth"
	"github.com/newstarnion/gateway/internal/domain"
	"github.com/newstarnion/gateway/internal/domain/entity"
	"github.com/newstarnion/gateway/internal/infrastructure/embedding"
	"github.com/newstarnion/gateway/internal/infrastructure/exif"
	"github.com/newstarnion/gateway/internal/infrastructure/mediastore"
	"github.com/newstarnion/gateway/internal/infrastructure/mimeutil"
	filesusecase "github.com/newstarnion/gateway/internal/usecase/files"
	"go.uber.org/zap"
)

// maxUploadBytes caps the multipart upload size at 100 MB.
const maxUploadBytes = 100 * 1024 * 1024

type Handler struct {
	uc     *filesusecase.UseCase
	store  *mediastore.Store
	cfg    *config.Config
	logger *zap.Logger
}

func NewHandler(uc *filesusecase.UseCase, store *mediastore.Store, cfg *config.Config, logger *zap.Logger) *Handler {
	return &Handler{uc: uc, store: store, cfg: cfg, logger: logger}
}

func (h *Handler) Register(protected *echo.Group) {
	protected.GET("/files", h.list)
	protected.POST("/files", h.upload)
	protected.GET("/files/search", h.search)
	protected.GET("/files/:id", h.get)
	protected.GET("/files/:id/signed-url", h.signedURL)
	protected.PATCH("/files/:id", h.patch)
	protected.DELETE("/files/:id", h.delete)
	protected.POST("/files/:id/index", h.index)
}

func unauthorized(c echo.Context) error {
	return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
}

// ── List / Get / Delete / Patch ──────────────────────────────────

func (h *Handler) list(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	page, _ := strconv.Atoi(c.QueryParam("page"))
	limit, _ := strconv.Atoi(c.QueryParam("limit"))
	result, err := h.uc.ListFiles(c.Request().Context(), userID, entity.FileFilter{
		FileType: c.QueryParam("type"),
		Name:     strings.TrimSpace(c.QueryParam("name")),
		Page:     page,
		Limit:    limit,
	})
	if err != nil {
		h.logger.Warn("files list failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to fetch files"})
	}
	out := make([]map[string]any, 0, len(result.Files))
	for _, f := range result.Files {
		out = append(out, fileToMap(f))
	}
	resp := map[string]any{
		"files": out,
		"total": result.Total,
		"page":  result.Page,
		"limit": result.Limit,
	}
	if result.TypeCounts != nil {
		resp["type_counts"] = result.TypeCounts
	}
	return c.JSON(http.StatusOK, resp)
}

func (h *Handler) get(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	f, err := h.uc.GetFile(c.Request().Context(), userID, c.Param("id"))
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return c.JSON(http.StatusNotFound, map[string]string{"error": "file not found"})
		}
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to fetch file"})
	}
	return c.JSON(http.StatusOK, fileToMap(f))
}

func (h *Handler) delete(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	ctx := c.Request().Context()
	objectKey, err := h.uc.DeleteFile(ctx, userID, c.Param("id"))
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to delete file"})
	}
	if objectKey != "" {
		// Best-effort object removal — the DB row is already gone.
		_ = h.store.Delete(ctx, objectKey)
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "deleted"})
}

func (h *Handler) patch(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	var body struct {
		Transcript *string `json:"transcript"`
		Analysis   *string `json:"analysis"`
		SubType    *string `json:"sub_type"`
		Prompt     *string `json:"prompt"`
	}
	if err := c.Bind(&body); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid body"})
	}
	if err := h.uc.PatchFile(c.Request().Context(), userID, c.Param("id"), entity.FilePatch{
		Transcript: body.Transcript,
		Analysis:   body.Analysis,
		SubType:    body.SubType,
		Prompt:     body.Prompt,
	}); err != nil {
		if errors.Is(err, domain.ErrInvalidArgument) {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": err.Error()})
		}
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "update failed"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "updated"})
}

// ── Signed URL ───────────────────────────────────────────────────

func (h *Handler) signedURL(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	res, err := h.uc.SignedURL(c.Request().Context(), userID, c.Param("id"))
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return c.JSON(http.StatusNotFound, map[string]string{"error": "file not found"})
		}
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to sign url"})
	}
	return c.JSON(http.StatusOK, map[string]any{
		"url":        res.URL,
		"expires_in": res.ExpiresIn,
	})
}

// ── Upload ───────────────────────────────────────────────────────

func (h *Handler) upload(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	file, err := c.FormFile("file")
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "file field is required"})
	}
	if file.Size > maxUploadBytes {
		return c.JSON(http.StatusRequestEntityTooLarge, map[string]string{
			"error": fmt.Sprintf("file too large (max %d MB)", maxUploadBytes/1024/1024),
		})
	}
	src, err := file.Open()
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to open file"})
	}
	defer src.Close()
	data, err := io.ReadAll(src)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to read file"})
	}

	mimeType := file.Header.Get("Content-Type")
	if mimeType == "" || mimeType == "application/octet-stream" {
		mimeType = mime.TypeByExtension(filepath.Ext(file.Filename))
		if mimeType == "" {
			mimeType = "application/octet-stream"
		}
	}
	fileType := mimeutil.DetectFileType(mimeType, file.Filename)

	var metadata map[string]any
	if strings.HasPrefix(strings.ToLower(mimeType), "image/") {
		metadata = exif.ExtractImageMetadata(data)
	}
	metadataJSON, _ := json.Marshal(metadata)
	if len(metadata) == 0 {
		metadataJSON = []byte("{}")
	}

	objectKey := fmt.Sprintf("users/%s/files/%s/%s%s",
		userID, time.Now().Format("2006"), uuid.New().String(), filepath.Ext(file.Filename))

	ctx := c.Request().Context()
	fileURL, err := h.store.Put(ctx, objectKey, bytes.NewReader(data), int64(len(data)), mimeType)
	if err != nil {
		h.logger.Error("files upload: store put failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "upload failed"})
	}

	now := time.Now()
	id, err := h.uc.InsertFile(ctx, userID, entity.FileCreate{
		Name:      file.Filename,
		MIME:      mimeType,
		FileType:  fileType,
		URL:       fileURL,
		ObjectKey: objectKey,
		Size:      int64(len(data)),
		Source:    "web",
		SubType:   "uploaded",
		Metadata:  metadataJSON,
		CreatedAt: now,
	})
	if err != nil {
		h.logger.Error("files upload: DB insert failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to save file"})
	}

	ext := filepath.Ext(file.Filename)
	resp := map[string]any{
		"id":         id,
		"name":       file.Filename,
		"mime":       mimeType,
		"file_type":  fileType,
		"format":     fileFormat(ext),
		"url":        fileURL,
		"object_key": objectKey,
		"size":       int64(len(data)),
		"size_label": fileSizeLabel(int64(len(data))),
		"indexed":    false,
		"source":     "web",
		"sub_type":   "uploaded",
		"created_at": now.Format(time.RFC3339),
	}
	if len(metadata) > 0 {
		resp["metadata"] = metadata
	} else {
		resp["metadata"] = map[string]any{}
	}
	return c.JSON(http.StatusCreated, resp)
}

// ── Index ────────────────────────────────────────────────────────

func (h *Handler) index(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	ctx := c.Request().Context()

	// Close over h.store so the usecase can pull bytes from either
	// MinIO or the local filesystem without importing mediastore.
	readFile := func(ctx context.Context, objectKey string) ([]byte, error) {
		obj, err := h.store.Get(ctx, objectKey)
		if err != nil {
			return nil, err
		}
		defer obj.Body.Close()
		return io.ReadAll(obj.Body)
	}

	result, err := h.uc.IndexFile(ctx, userID, c.Param("id"), readFile)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return c.JSON(http.StatusNotFound, map[string]string{"error": "document not found"})
		}
		if errors.Is(err, domain.ErrInvalidArgument) {
			return c.JSON(http.StatusUnprocessableEntity, map[string]string{"error": err.Error()})
		}
		h.logger.Error("files index failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "indexing failed"})
	}
	return c.JSON(http.StatusOK, map[string]any{
		"id":          result.FileID,
		"indexed":     result.Indexed,
		"chunks":      result.Chunks,
		"embedding":   result.Embedding,
		"search_mode": result.SearchMode,
	})
}

// ── Search ───────────────────────────────────────────────────────

func (h *Handler) search(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	limit, _ := strconv.Atoi(c.QueryParam("limit"))
	result, err := h.uc.Search(c.Request().Context(), userID, c.QueryParam("q"), limit)
	if err != nil {
		if errors.Is(err, domain.ErrInvalidArgument) {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": err.Error()})
		}
		h.logger.Warn("files search failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "search failed"})
	}
	hits := make([]map[string]any, 0, len(result.Hits))
	for _, hit := range result.Hits {
		hits = append(hits, map[string]any{
			"id":         hit.SectionID,
			"source":     "file",
			"file_id":    hit.FileID,
			"file_name":  hit.FileName,
			"file_type":  hit.FileType,
			"content":    hit.Content,
			"similarity": hit.Similarity,
		})
	}
	return c.JSON(http.StatusOK, map[string]any{
		"results":     hits,
		"query":       result.Query,
		"search_mode": result.SearchMode,
	})
}

// ── JSON mapper + helpers ─────────────────────────────────────────

func fileToMap(f entity.File) map[string]any {
	ext := ""
	if f.Name != "" {
		ext = filepath.Ext(f.Name)
	}
	result := map[string]any{
		"id":         f.ID,
		"name":       f.Name,
		"mime":       f.MIME,
		"file_type":  f.FileType,
		"format":     fileFormat(ext),
		"url":        f.URL,
		"object_key": f.ObjectKey,
		"size":       f.Size,
		"size_label": fileSizeLabel(f.Size),
		"source":     f.Source,
		"sub_type":   f.SubType,
		"indexed":    f.Indexed,
		"duration":   f.Duration,
		"created_at": f.CreatedAt.Format(time.RFC3339),
	}
	// Legacy null handling — the UI distinguishes "", nil, and
	// present values for these fields.
	result["prompt"] = nilIfEmpty(f.Prompt)
	result["analysis"] = nilIfEmpty(f.Analysis)
	result["transcript"] = nilIfEmpty(f.Transcript)
	// Metadata: parse JSONB into a map for the response.
	var meta map[string]any
	if len(f.Metadata) > 0 && json.Unmarshal(f.Metadata, &meta) == nil && len(meta) > 0 {
		result["metadata"] = meta
	} else {
		result["metadata"] = map[string]any{}
	}
	return result
}

func nilIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func fileSizeLabel(n int64) string {
	const (
		KB = 1024
		MB = 1024 * KB
	)
	switch {
	case n >= MB:
		return fmt.Sprintf("%.1f MB", float64(n)/float64(MB))
	case n >= KB:
		return fmt.Sprintf("%.0f KB", float64(n)/float64(KB))
	default:
		return fmt.Sprintf("%d B", n)
	}
}

func fileFormat(ext string) string {
	switch strings.ToLower(strings.TrimPrefix(ext, ".")) {
	case "pdf":
		return "PDF"
	case "doc", "docx":
		return "DOCX"
	case "xls", "xlsx":
		return "XLSX"
	case "ppt", "pptx":
		return "PPTX"
	case "md", "markdown":
		return "MD"
	case "txt", "text":
		return "TXT"
	case "csv":
		return "CSV"
	case "hwp":
		return "HWP"
	case "hwpx":
		return "HWPX"
	case "jpg", "jpeg":
		return "JPEG"
	case "png":
		return "PNG"
	case "gif":
		return "GIF"
	case "webp":
		return "WEBP"
	case "mp3":
		return "MP3"
	case "wav":
		return "WAV"
	case "ogg":
		return "OGG"
	case "m4a":
		return "M4A"
	case "webm":
		return "WEBM"
	default:
		return strings.ToUpper(strings.TrimPrefix(ext, "."))
	}
}

// ── Embedder adapter ─────────────────────────────────────────────

// EmbedderAdapter implements filesusecase.Embedder against the
// infrastructure/embedding client. It resolves the per-user
// provider config on each call so key rotations take effect
// immediately.
type EmbedderAdapter struct {
	// DB is captured by the bootstrap wiring as an opaque pointer
	// the embedding client accepts — this adapter does not touch
	// SQL directly.
	resolveConfig func(ctx context.Context, userID uuid.UUID) (embedding.Config, error)
}

func NewEmbedderAdapter(resolveConfig func(ctx context.Context, userID uuid.UUID) (embedding.Config, error)) *EmbedderAdapter {
	return &EmbedderAdapter{resolveConfig: resolveConfig}
}

func (e *EmbedderAdapter) Generate(ctx context.Context, userID uuid.UUID, text string) ([]float32, error) {
	cfg, err := e.resolveConfig(ctx, userID)
	if err != nil {
		return nil, err
	}
	return embedding.Generate(ctx, cfg, text)
}

func (e *EmbedderAdapter) VectorLiteral(vec []float32) string {
	return embedding.VectorLiteral(vec)
}

func (e *EmbedderAdapter) Enabled(ctx context.Context, userID uuid.UUID) bool {
	_, err := e.resolveConfig(ctx, userID)
	return err == nil
}

// ── Text extractor adapter ──────────────────────────────────────

// TextExtractorAdapter implements filesusecase.TextExtractor by
// shelling out to `python3 <skills_dir>/documents/scripts/extract_text.py`.
// The script's stdin is the raw file bytes; its stdout is the
// extracted plain text.
type TextExtractorAdapter struct {
	scriptPath string
}

func NewTextExtractorAdapter(skillsDir string) *TextExtractorAdapter {
	return &TextExtractorAdapter{
		scriptPath: filepath.Join(skillsDir, "documents", "scripts", "extract_text.py"),
	}
}

func (t *TextExtractorAdapter) Extract(ctx context.Context, data []byte, ext, filename string) (string, error) {
	low := strings.ToLower(ext)
	switch low {
	case "txt", "text", "md", "markdown", "csv":
		return string(data), nil
	}
	cmd := exec.CommandContext(ctx, "python3", t.scriptPath, "--ext", low, "--filename", filepath.Base(filename))
	cmd.Stdin = bytes.NewReader(data)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	out, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("extract_text.py failed: %s", strings.TrimSpace(stderr.String()))
	}
	return strings.TrimSpace(string(out)), nil
}
