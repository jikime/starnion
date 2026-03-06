package handler

import (
	"context"
	"database/sql"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/rs/zerolog/log"
)

// AudioHandler handles user audio file CRUD.
type AudioHandler struct {
	db *sql.DB
}

func NewAudioHandler(db *sql.DB) *AudioHandler {
	return &AudioHandler{db: db}
}

type audioItem struct {
	ID         int64  `json:"id"`
	URL        string `json:"url"`
	Name       string `json:"name"`
	Mime       string `json:"mime"`
	Size       int64  `json:"size"`
	Duration   int    `json:"duration"`
	Source     string `json:"source"`
	Type       string `json:"type"`
	Transcript string `json:"transcript"`
	Prompt     string `json:"prompt"`
	SizeLabel  string `json:"size_label"`
	CreatedAt  string `json:"created_at"`
}

// ListAudios GET /api/v1/audios?user_id=&type=&source=
func (h *AudioHandler) ListAudios(c echo.Context) error {
	userID := c.QueryParam("user_id")
	if userID == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "user_id is required"})
	}

	audioType := c.QueryParam("type")
	source := c.QueryParam("source")
	limitStr := c.QueryParam("limit")
	offsetStr := c.QueryParam("offset")

	limit := 100
	offset := 0
	if v, err := strconv.Atoi(limitStr); err == nil && v > 0 && v <= 500 {
		limit = v
	}
	if v, err := strconv.Atoi(offsetStr); err == nil && v >= 0 {
		offset = v
	}

	ctx, cancel := context.WithTimeout(c.Request().Context(), 10*time.Second)
	defer cancel()

	query := `
		SELECT id, url, name, mime, size, duration, source, type,
		       COALESCE(transcript,''), COALESCE(prompt,''), created_at
		FROM user_audios
		WHERE user_id = $1`
	args := []any{userID}
	argIdx := 2

	if audioType != "" {
		query += ` AND type = $` + strconv.Itoa(argIdx)
		args = append(args, audioType)
		argIdx++
	}
	if source != "" {
		query += ` AND source = $` + strconv.Itoa(argIdx)
		args = append(args, source)
		argIdx++
	}
	query += ` ORDER BY created_at DESC LIMIT $` + strconv.Itoa(argIdx) + ` OFFSET $` + strconv.Itoa(argIdx+1)
	args = append(args, limit, offset)

	rows, err := h.db.QueryContext(ctx, query, args...)
	if err != nil {
		log.Error().Err(err).Str("user_id", userID).Msg("list audios failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "query failed"})
	}
	defer rows.Close()

	items := []audioItem{}
	for rows.Next() {
		var item audioItem
		var createdAt time.Time
		if err := rows.Scan(&item.ID, &item.URL, &item.Name, &item.Mime, &item.Size,
			&item.Duration, &item.Source, &item.Type, &item.Transcript, &item.Prompt, &createdAt); err != nil {
			continue
		}
		item.SizeLabel = formatSize(item.Size)
		item.CreatedAt = createdAt.In(kstLoc()).Format("2006-01-02 15:04")
		items = append(items, item)
	}
	return c.JSON(http.StatusOK, items)
}

// SaveAudio POST /api/v1/audios
// Saves audio metadata immediately after a client-side MinIO upload.
// Returns the new row ID so the caller can later PATCH the transcript.
func (h *AudioHandler) SaveAudio(c echo.Context) error {
	var req struct {
		UserID   string `json:"user_id"`
		URL      string `json:"url"`
		Name     string `json:"name"`
		Mime     string `json:"mime"`
		Size     int64  `json:"size"`
		Duration int    `json:"duration"`
		Source   string `json:"source"`
		Type     string `json:"type"`
		Prompt   string `json:"prompt"`
	}
	if err := c.Bind(&req); err != nil || req.UserID == "" || req.URL == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "user_id and url are required"})
	}
	if !strings.HasPrefix(req.Mime, "audio/") {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "mime must be audio/*"})
	}
	if req.Source == "" {
		req.Source = "web"
	}
	if req.Type == "" {
		req.Type = "uploaded"
	}

	ctx, cancel := context.WithTimeout(c.Request().Context(), 5*time.Second)
	defer cancel()

	var id int64
	err := h.db.QueryRowContext(ctx, `
		INSERT INTO user_audios (user_id, url, name, mime, size, duration, source, type, prompt)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		RETURNING id
	`, req.UserID, req.URL, req.Name, req.Mime, req.Size, req.Duration, req.Source, req.Type, req.Prompt).Scan(&id)
	if err != nil {
		log.Error().Err(err).Str("user_id", req.UserID).Msg("save audio failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "save failed"})
	}
	return c.JSON(http.StatusCreated, map[string]any{"id": id})
}

// UpdateTranscript PATCH /api/v1/audios/:id/transcript?user_id=
// Stores the STT result for a previously saved audio row.
func (h *AudioHandler) UpdateTranscript(c echo.Context) error {
	userID := c.QueryParam("user_id")
	if userID == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "user_id is required"})
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid id"})
	}

	var body struct {
		Transcript string `json:"transcript"`
	}
	if err := c.Bind(&body); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid body"})
	}

	ctx, cancel := context.WithTimeout(c.Request().Context(), 5*time.Second)
	defer cancel()

	res, err := h.db.ExecContext(ctx,
		`UPDATE user_audios SET transcript = $1 WHERE id = $2 AND user_id = $3`,
		body.Transcript, id, userID)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "update failed"})
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "not found"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "updated"})
}

// DeleteAudio DELETE /api/v1/audios/:id?user_id=
func (h *AudioHandler) DeleteAudio(c echo.Context) error {
	userID := c.QueryParam("user_id")
	if userID == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "user_id is required"})
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid id"})
	}

	ctx, cancel := context.WithTimeout(c.Request().Context(), 5*time.Second)
	defer cancel()

	res, err := h.db.ExecContext(ctx,
		`DELETE FROM user_audios WHERE id = $1 AND user_id = $2`, id, userID)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "delete failed"})
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "not found"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "deleted"})
}

// RecordAudio inserts a user_audios row. Called after MinIO upload.
// audioType: 'uploaded' | 'recorded' | 'generated'
func RecordAudio(db *sql.DB, userID, url, name, mime string, size int64, duration int, source, audioType, transcript, prompt string) {
	if db == nil {
		return
	}
	if !strings.HasPrefix(mime, "audio/") {
		return
	}
	_, err := db.ExecContext(context.Background(), `
		INSERT INTO user_audios (user_id, url, name, mime, size, duration, source, type, transcript, prompt)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
	`, userID, url, name, mime, size, duration, source, audioType, transcript, prompt)
	if err != nil {
		log.Warn().Err(err).Str("user_id", userID).Str("url", url).Msg("record audio failed")
	}
}
