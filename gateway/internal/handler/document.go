package handler

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jikime/starnion/gateway/internal/storage"
	"github.com/labstack/echo/v4"
	"github.com/rs/zerolog/log"
)

// DocumentHandler handles document CRUD backed by MinIO + DB.
type DocumentHandler struct {
	db           *sql.DB
	minio        *storage.MinIO
	agentHTTPURL string // e.g. "http://agent:8082"
}

func NewDocumentHandler(db *sql.DB, minio *storage.MinIO, agentHTTPURL string) *DocumentHandler {
	return &DocumentHandler{db: db, minio: minio, agentHTTPURL: agentHTTPURL}
}

type documentItem struct {
	ID        int64  `json:"id"`
	Name      string `json:"name"`
	Mime      string `json:"mime"`
	URL       string `json:"url"`
	Size      int64  `json:"size"`
	Format    string `json:"format"`
	SizeLabel string `json:"size_label"`
	CreatedAt string `json:"created_at"`
}

// ListDocuments GET /documents
func (h *DocumentHandler) ListDocuments(c echo.Context) error {
	userID, ok := c.Get("userID").(string)
	if !ok || userID == "" {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	ctx, cancel := context.WithTimeout(c.Request().Context(), 10*time.Second)
	defer cancel()

	rows, err := h.db.QueryContext(ctx, `
		SELECT id, title, file_type, file_url, size, uploaded_at
		FROM documents
		WHERE user_id = $1
		ORDER BY uploaded_at DESC
		LIMIT 100
	`, userID)
	if err != nil {
		log.Error().Err(err).Str("user_id", userID).Msg("list documents failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "query failed"})
	}
	defer rows.Close()

	items := []documentItem{}
	for rows.Next() {
		var item documentItem
		var uploadedAt time.Time
		if err := rows.Scan(&item.ID, &item.Name, &item.Mime, &item.URL, &item.Size, &uploadedAt); err != nil {
			continue
		}
		item.Format = formatFromFilename(item.Name, item.Mime)
		item.SizeLabel = formatSize(item.Size)
		item.CreatedAt = uploadedAt.In(kstLoc()).Format("2006-01-02")
		items = append(items, item)
	}
	return c.JSON(http.StatusOK, items)
}

// UploadDocument POST /documents (multipart: file, user_id)
func (h *DocumentHandler) UploadDocument(c echo.Context) error {
	userID, ok := c.Get("userID").(string)
	if !ok || userID == "" {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	if h.minio == nil {
		return c.JSON(http.StatusServiceUnavailable, map[string]string{"error": "storage not configured"})
	}

	fh, err := c.FormFile("file")
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "file field is required"})
	}

	// Validate supported formats.
	allowed := map[string]bool{
		"application/pdf":    true,
		"application/msword": true,
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document": true,
		"application/vnd.ms-excel": true,
		"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":         true,
		"application/vnd.ms-powerpoint":                                             true,
		"application/vnd.openxmlformats-officedocument.presentationml.presentation": true,
		"text/plain":    true,
		"text/markdown": true,
		"text/csv":      true,
	}
	contentType := fh.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	mimeBase := strings.Split(contentType, ";")[0]
	if !allowed[mimeBase] {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": fmt.Sprintf("unsupported file type: %s", mimeBase)})
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

	att, err := h.minio.Upload(c.Request().Context(), fh.Filename, mimeBase, data)
	if err != nil {
		log.Error().Err(err).Str("user_id", userID).Str("file", fh.Filename).Msg("minio upload failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "upload failed"})
	}

	// Derive the object key from the URL (last two path segments: <hex>/<name>).
	parts := strings.Split(att.URL, "/")
	objectKey := ""
	if len(parts) >= 2 {
		objectKey = parts[len(parts)-2] + "/" + parts[len(parts)-1]
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var id int64
	err = h.db.QueryRowContext(ctx, `
		INSERT INTO documents (user_id, title, file_type, file_url, object_key, size)
		VALUES ($1, $2, $3, $4, $5, $6) RETURNING id
	`, userID, att.Name, att.Mime, att.URL, objectKey, att.Size).Scan(&id)
	if err != nil {
		log.Error().Err(err).Str("user_id", userID).Msg("save document metadata failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "save failed"})
	}

	// Trigger background document indexing (chunking + embedding) via agent.
	if h.agentHTTPURL != "" {
		go h.indexDocument(id, userID, att.URL, att.Name)
	}

	return c.JSON(http.StatusCreated, documentItem{
		ID:        id,
		Name:      att.Name,
		Mime:      att.Mime,
		URL:       att.URL,
		Size:      att.Size,
		Format:    formatFromFilename(att.Name, att.Mime),
		SizeLabel: formatSize(att.Size),
		CreatedAt: time.Now().In(kstLoc()).Format("2006-01-02"),
	})
}

// DeleteDocument DELETE /documents/:id
func (h *DocumentHandler) DeleteDocument(c echo.Context) error {
	userID, ok := c.Get("userID").(string)
	if !ok || userID == "" {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid id"})
	}

	ctx, cancel := context.WithTimeout(c.Request().Context(), 5*time.Second)
	defer cancel()

	res, err := h.db.ExecContext(ctx,
		`DELETE FROM documents WHERE id = $1 AND user_id = $2`, id, userID)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "delete failed"})
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "not found"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "deleted"})
}

// ── helpers ───────────────────────────────────────────────────────────────────

// indexDocument fires a POST /index-document request to the agent's HTTP
// server so it can extract text, chunk, embed, and store document_sections.
// Runs in a goroutine — errors are logged but do not affect the upload response.
func (h *DocumentHandler) indexDocument(docID int64, userID, fileURL, fileName string) {
	type payload struct {
		UserID   string `json:"user_id"`
		DocID    int64  `json:"doc_id"`
		FileURL  string `json:"file_url"`
		FileName string `json:"file_name"`
	}
	body, err := json.Marshal(payload{
		UserID:   userID,
		DocID:    docID,
		FileURL:  fileURL,
		FileName: fileName,
	})
	if err != nil {
		log.Error().Err(err).Int64("doc_id", docID).Msg("index document: marshal failed")
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		h.agentHTTPURL+"/index-document", bytes.NewReader(body))
	if err != nil {
		log.Error().Err(err).Int64("doc_id", docID).Msg("index document: build request failed")
		return
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Warn().Err(err).Int64("doc_id", docID).Msg("index document: agent unreachable")
		return
	}
	defer resp.Body.Close()

	log.Info().Int64("doc_id", docID).Int("status", resp.StatusCode).Msg("index document: queued")
}

// RecordDocument inserts a documents row for an AI-generated file.
// Called by chat_stream and telegram bot after uploading a document to MinIO.
func RecordDocument(db *sql.DB, userID, url, name, mime string, size int64) {
	if db == nil || !isDocumentMime(mime) {
		return
	}
	// Derive MinIO object key from the URL (last two path segments: <hex>/<name>).
	parts := strings.Split(url, "/")
	objectKey := ""
	if len(parts) >= 2 {
		objectKey = parts[len(parts)-2] + "/" + parts[len(parts)-1]
	}
	_, err := db.ExecContext(context.Background(), `
		INSERT INTO documents (user_id, title, file_type, file_url, object_key, size)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, userID, name, mime, url, objectKey, size)
	if err != nil {
		log.Warn().Err(err).Str("user_id", userID).Str("url", url).Msg("record document failed")
	}
}

// isDocumentMime reports whether mime is a supported document type.
func isDocumentMime(mime string) bool {
	switch mime {
	case "application/pdf",
		"application/msword",
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		"application/vnd.ms-excel",
		"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		"application/vnd.ms-powerpoint",
		"application/vnd.openxmlformats-officedocument.presentationml.presentation",
		"text/plain",
		"text/markdown",
		"text/csv":
		return true
	}
	return false
}

func formatFromFilename(name, mime string) string {
	if idx := strings.LastIndex(name, "."); idx >= 0 {
		return strings.ToUpper(name[idx+1:])
	}
	switch {
	case strings.Contains(mime, "pdf"):
		return "PDF"
	case strings.Contains(mime, "word"), strings.Contains(mime, "docx"):
		return "DOCX"
	case strings.Contains(mime, "excel"), strings.Contains(mime, "xlsx"):
		return "XLSX"
	case strings.Contains(mime, "powerpoint"), strings.Contains(mime, "pptx"):
		return "PPTX"
	case strings.Contains(mime, "text/plain"):
		return "TXT"
	case strings.Contains(mime, "csv"):
		return "CSV"
	default:
		return "FILE"
	}
}

func formatSize(bytes int64) string {
	if bytes < 1024 {
		return fmt.Sprintf("%dB", bytes)
	}
	if bytes < 1024*1024 {
		return fmt.Sprintf("%dKB", bytes/1024)
	}
	return fmt.Sprintf("%.1fMB", float64(bytes)/(1024*1024))
}
