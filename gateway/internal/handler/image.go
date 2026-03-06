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

// ImageHandler handles user image gallery CRUD.
type ImageHandler struct {
	db *sql.DB
}

func NewImageHandler(db *sql.DB) *ImageHandler {
	return &ImageHandler{db: db}
}

type imageItem struct {
	ID        int64  `json:"id"`
	URL       string `json:"url"`
	Name      string `json:"name"`
	Mime      string `json:"mime"`
	Size      int64  `json:"size"`
	Source    string `json:"source"`
	Type      string `json:"type"`
	Prompt    string `json:"prompt"`
	SizeLabel string `json:"size_label"`
	CreatedAt string `json:"created_at"`
}

// ListImages GET /api/v1/images?user_id=&type=&source=&limit=&offset=
func (h *ImageHandler) ListImages(c echo.Context) error {
	userID := c.QueryParam("user_id")
	if userID == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "user_id is required"})
	}

	imgType := c.QueryParam("type")     // optional: generated|edited|analyzed
	source := c.QueryParam("source")    // optional: web|telegram|webchat
	limitStr := c.QueryParam("limit")
	offsetStr := c.QueryParam("offset")

	limit := 50
	offset := 0
	if v, err := strconv.Atoi(limitStr); err == nil && v > 0 && v <= 200 {
		limit = v
	}
	if v, err := strconv.Atoi(offsetStr); err == nil && v >= 0 {
		offset = v
	}

	ctx, cancel := context.WithTimeout(c.Request().Context(), 10*time.Second)
	defer cancel()

	query := `
		SELECT id, url, name, mime, size, source, type, COALESCE(prompt,''), created_at
		FROM user_images
		WHERE user_id = $1`
	args := []any{userID}
	argIdx := 2

	if imgType != "" {
		query += ` AND type = $` + strconv.Itoa(argIdx)
		args = append(args, imgType)
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
		log.Error().Err(err).Str("user_id", userID).Msg("list images failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "query failed"})
	}
	defer rows.Close()

	items := []imageItem{}
	for rows.Next() {
		var item imageItem
		var createdAt time.Time
		if err := rows.Scan(&item.ID, &item.URL, &item.Name, &item.Mime, &item.Size,
			&item.Source, &item.Type, &item.Prompt, &createdAt); err != nil {
			continue
		}
		item.SizeLabel = formatSize(item.Size)
		item.CreatedAt = createdAt.In(kstLoc()).Format("2006-01-02 15:04")
		items = append(items, item)
	}
	return c.JSON(http.StatusOK, items)
}

// DeleteImage DELETE /api/v1/images/:id?user_id=
func (h *ImageHandler) DeleteImage(c echo.Context) error {
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
		`DELETE FROM user_images WHERE id = $1 AND user_id = $2`, id, userID)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "delete failed"})
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "not found"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "deleted"})
}

// ImageTypeFromFileName returns 'generated' or 'edited' based on the agent file name.
func ImageTypeFromFileName(name string) string {
	return imageTypeFromFileName(name)
}

// imageTypeFromFileName returns 'generated' or 'edited' based on the agent file name.
func imageTypeFromFileName(name string) string {
	if strings.HasPrefix(name, "edited") {
		return "edited"
	}
	return "generated"
}

// RecordImage inserts a user_images row. Called by chat_stream and hub after uploading an image.
func RecordImage(db *sql.DB, userID, url, name, mime string, size int64, source, imgType, prompt string) {
	if db == nil {
		return
	}
	// Only record image/* mime types.
	if !strings.HasPrefix(mime, "image/") {
		return
	}
	_, err := db.ExecContext(context.Background(), `
		INSERT INTO user_images (user_id, url, name, mime, size, source, type, prompt)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`, userID, url, name, mime, size, source, imgType, prompt)
	if err != nil {
		log.Warn().Err(err).Str("user_id", userID).Str("url", url).Msg("record image failed")
	}
}
