package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"github.com/newstarnion/gateway/config"
	"github.com/newstarnion/gateway/internal/infrastructure/database"
	"go.uber.org/zap"
)

type FilesHandler struct {
	db     *database.DB
	config *config.Config
	logger *zap.Logger
	minio  *minio.Client
}

func NewFilesHandler(db *database.DB, cfg *config.Config, logger *zap.Logger) *FilesHandler {
	var minioClient *minio.Client
	if cfg.MinioAccessKey != "" {
		var err error
		minioClient, err = minio.New(cfg.MinioEndpoint, &minio.Options{
			Creds:  credentials.NewStaticV4(cfg.MinioAccessKey, cfg.MinioSecretKey, ""),
			Secure: cfg.MinioUseSSL,
		})
		if err != nil {
			logger.Warn("files: failed to init MinIO client", zap.Error(err))
		} else {
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			exists, _ := minioClient.BucketExists(ctx, cfg.MinioBucket)
			if !exists {
				if mkErr := minioClient.MakeBucket(ctx, cfg.MinioBucket, minio.MakeBucketOptions{}); mkErr != nil {
					logger.Warn("files: failed to create MinIO bucket", zap.Error(mkErr))
				}
			}
		}
	}
	return &FilesHandler{db: db, config: cfg, logger: logger, minio: minioClient}
}

// fileSizeLabel converts bytes to human-readable size string.
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

// fileFormat derives a short uppercase format tag from extension.
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

// scanFile scans a row from files table into a map.
func scanFile(
	id *int64, name, mime, fileType, url, objectKey *string, size *int64,
	source, subType *string, indexed *bool, prompt, analysis, transcript *string,
	duration *int, metadataRaw *json.RawMessage, createdAt *time.Time,
) map[string]any {
	ext := ""
	if *name != "" {
		ext = filepath.Ext(*name)
	}
	result := map[string]any{
		"id":         *id,
		"name":       *name,
		"mime":       *mime,
		"file_type":  *fileType,
		"format":     fileFormat(ext),
		"url":        *url,
		"object_key": *objectKey,
		"size":       *size,
		"size_label": fileSizeLabel(*size),
		"source":     *source,
		"sub_type":   *subType,
		"indexed":    *indexed,
		"created_at": createdAt.Format("2006-01-02T15:04:05Z07:00"),
	}
	if prompt != nil {
		result["prompt"] = *prompt
	} else {
		result["prompt"] = nil
	}
	if analysis != nil {
		result["analysis"] = *analysis
	} else {
		result["analysis"] = nil
	}
	if transcript != nil {
		result["transcript"] = *transcript
	} else {
		result["transcript"] = nil
	}
	result["duration"] = *duration
	// Metadata: parse JSONB into map for the response
	if metadataRaw != nil && len(*metadataRaw) > 0 {
		var meta map[string]any
		if json.Unmarshal(*metadataRaw, &meta) == nil && len(meta) > 0 {
			result["metadata"] = meta
		} else {
			result["metadata"] = map[string]any{}
		}
	} else {
		result["metadata"] = map[string]any{}
	}
	return result
}

// GET /api/v1/files?type=document|image|audio&page=1&limit=20&name=
func (h *FilesHandler) List(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	page, _ := strconv.Atoi(c.QueryParam("page"))
	if page < 1 {
		page = 1
	}
	limit, _ := strconv.Atoi(c.QueryParam("limit"))
	if limit < 1 || limit > 100 {
		limit = 20
	}
	offset := (page - 1) * limit
	fileTypeFilter := c.QueryParam("type") // document | image | audio | "" (all)
	nameFilter := strings.TrimSpace(c.QueryParam("name"))
	ctx := c.Request().Context()

	// Build WHERE clause dynamically to support optional type and name filters.
	whereArgs := []any{userID}
	where := "WHERE user_id = $1"
	argN := 2
	if fileTypeFilter == "document" || fileTypeFilter == "image" || fileTypeFilter == "audio" {
		where += fmt.Sprintf(" AND file_type = $%d", argN)
		whereArgs = append(whereArgs, fileTypeFilter)
		argN++
	} else {
		fileTypeFilter = "" // normalise unsupported values
	}
	if nameFilter != "" {
		where += fmt.Sprintf(" AND name ILIKE $%d", argN)
		whereArgs = append(whereArgs, "%"+nameFilter+"%")
		argN++
	}

	var total int
	if scanErr := h.db.QueryRowContext(ctx,
		"SELECT COUNT(*) FROM files "+where, whereArgs...,
	).Scan(&total); scanErr != nil {
		h.logger.Warn("files: count query failed", zap.Error(scanErr))
	}

	listArgs := append(append([]any{}, whereArgs...), limit, offset)
	rows, err := h.db.QueryContext(ctx, fmt.Sprintf(
		`SELECT id, name, mime, file_type, url, object_key, size, source, sub_type,
		        indexed, prompt, analysis, transcript, duration, metadata, created_at
		 FROM files %s ORDER BY created_at DESC LIMIT $%d OFFSET $%d`,
		where, argN, argN+1,
	), listArgs...)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to fetch files"})
	}
	defer rows.Close()

	var files []map[string]any
	for rows.Next() {
		var id int64
		var name, mimeType, fileType, url, objectKey, source, subType string
		var size int64
		var indexed bool
		var prompt, analysis, transcript *string
		var duration int
		var metadataRaw json.RawMessage
		var createdAt time.Time
		if rows.Scan(&id, &name, &mimeType, &fileType, &url, &objectKey, &size, &source, &subType,
			&indexed, &prompt, &analysis, &transcript, &duration, &metadataRaw, &createdAt) != nil {
			continue
		}
		files = append(files, scanFile(&id, &name, &mimeType, &fileType, &url, &objectKey, &size,
			&source, &subType, &indexed, prompt, analysis, transcript, &duration, &metadataRaw, &createdAt))
	}
	if files == nil {
		files = []map[string]any{}
	}

	resp := map[string]any{
		"files": files, "total": total, "page": page, "limit": limit,
	}

	// When fetching all types, include per-type counts using a single GROUP BY query.
	if fileTypeFilter == "" {
		counts := map[string]int{"document": 0, "image": 0, "audio": 0}
		cRows, cErr := h.db.QueryContext(ctx,
			`SELECT file_type, COUNT(*) FROM files WHERE user_id = $1 GROUP BY file_type`,
			userID,
		)
		if cErr == nil {
			defer cRows.Close()
			for cRows.Next() {
				var ft string
				var n int
				if cRows.Scan(&ft, &n) == nil {
					counts[ft] = n
				}
			}
		} else {
			h.logger.Warn("files: type counts query failed", zap.Error(cErr))
		}
		resp["type_counts"] = counts
	}

	return c.JSON(http.StatusOK, resp)
}

// POST /api/v1/files — multipart upload
func (h *FilesHandler) Upload(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
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

	// Read all bytes so we can both extract EXIF and upload to storage.
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

	// Detect file_type from mime
	fileType := detectFileType(mimeType, file.Filename)

	// Extract EXIF metadata for images
	var metadata map[string]any
	if strings.HasPrefix(strings.ToLower(mimeType), "image/") {
		metadata = extractImageMetadata(data)
	}
	metadataJSON, _ := json.Marshal(metadata)
	if metadata == nil || len(metadata) == 0 {
		metadataJSON = []byte("{}")
	}

	objectKey := fmt.Sprintf("users/%s/files/%s/%s%s",
		userID,
		time.Now().Format("2006"),
		uuid.New().String(),
		filepath.Ext(file.Filename),
	)

	ctx := c.Request().Context()
	var fileURL string

	if h.minio != nil {
		_, err = h.minio.PutObject(ctx, h.config.MinioBucket, objectKey,
			bytes.NewReader(data), int64(len(data)),
			minio.PutObjectOptions{ContentType: mimeType},
		)
		if err != nil {
			h.logger.Error("files: MinIO upload failed", zap.Error(err))
			return c.JSON(http.StatusInternalServerError, map[string]string{"error": "upload failed"})
		}
		if h.config.MinioPublicURL != "" {
			fileURL = h.config.MinioPublicURL + "/" + h.config.MinioBucket + "/" + objectKey
		} else {
			fileURL = "/api/files/" + objectKey
		}
	} else {
		uploadDir := filepath.Join(h.config.SessionDir, "uploads", filepath.Dir(objectKey))
		if mkErr := os.MkdirAll(uploadDir, 0755); mkErr != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to create storage directory"})
		}
		destPath := filepath.Join(h.config.SessionDir, "uploads", objectKey)
		dest, mkErr := os.Create(destPath)
		if mkErr != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to save file"})
		}
		defer dest.Close()
		if _, cpErr := io.Copy(dest, bytes.NewReader(data)); cpErr != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to write file"})
		}
		fileURL = "/api/files/" + objectKey
	}

	var id int64
	now := time.Now()
	err = h.db.QueryRowContext(ctx,
		`INSERT INTO files (user_id, name, mime, file_type, url, object_key, size, source, sub_type, metadata, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, 'web', 'uploaded', $8, $9) RETURNING id`,
		userID, file.Filename, mimeType, fileType, fileURL, objectKey, int64(len(data)), metadataJSON, now,
	).Scan(&id)
	if err != nil {
		h.logger.Error("files: DB insert failed", zap.Error(err))
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
		"created_at": now.Format("2006-01-02T15:04:05Z07:00"),
	}
	if len(metadata) > 0 {
		resp["metadata"] = metadata
	} else {
		resp["metadata"] = map[string]any{}
	}
	return c.JSON(http.StatusCreated, resp)
}

// detectFileType determines file category from MIME type and filename.
func detectFileType(mimeType, filename string) string {
	m := strings.ToLower(mimeType)
	if strings.HasPrefix(m, "image/") {
		return "image"
	}
	if strings.HasPrefix(m, "audio/") || strings.HasPrefix(m, "video/") {
		return "audio"
	}
	ext := strings.ToLower(strings.TrimPrefix(filepath.Ext(filename), "."))
	audioExts := map[string]bool{
		"mp3": true, "wav": true, "ogg": true, "m4a": true,
		"webm": true, "flac": true, "aac": true,
	}
	imageExts := map[string]bool{
		"jpg": true, "jpeg": true, "png": true, "gif": true, "webp": true, "svg": true,
	}
	if audioExts[ext] {
		return "audio"
	}
	if imageExts[ext] {
		return "image"
	}
	return "document"
}

// GET /api/v1/files/:id
func (h *FilesHandler) Get(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	var id int64
	var name, mimeType, fileType, url, objectKey, source, subType string
	var size int64
	var indexed bool
	var prompt, analysis, transcript *string
	var duration int
	var metadataRaw json.RawMessage
	var createdAt time.Time

	err = h.db.QueryRowContext(c.Request().Context(),
		`SELECT id, name, mime, file_type, url, object_key, size, source, sub_type,
		        indexed, prompt, analysis, transcript, duration, metadata, created_at
		 FROM files WHERE id = $1 AND user_id = $2`,
		c.Param("id"), userID,
	).Scan(&id, &name, &mimeType, &fileType, &url, &objectKey, &size, &source, &subType,
		&indexed, &prompt, &analysis, &transcript, &duration, &metadataRaw, &createdAt)
	if err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "file not found"})
	}
	return c.JSON(http.StatusOK, scanFile(&id, &name, &mimeType, &fileType, &url, &objectKey, &size,
		&source, &subType, &indexed, prompt, analysis, transcript, &duration, &metadataRaw, &createdAt))
}

// DELETE /api/v1/files/:id
func (h *FilesHandler) Delete(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	var objectKey string
	h.db.QueryRowContext(c.Request().Context(), //nolint:errcheck
		`SELECT object_key FROM files WHERE id = $1 AND user_id = $2`,
		c.Param("id"), userID,
	).Scan(&objectKey)

	_, err = h.db.ExecContext(c.Request().Context(),
		`DELETE FROM files WHERE id = $1 AND user_id = $2`, c.Param("id"), userID,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to delete file"})
	}

	if objectKey != "" {
		if h.minio != nil {
			h.minio.RemoveObject(context.Background(), h.config.MinioBucket, objectKey, minio.RemoveObjectOptions{}) //nolint:errcheck
		} else {
			localPath := filepath.Join(h.config.SessionDir, "uploads", objectKey)
			os.Remove(localPath) //nolint:errcheck
		}
	}

	return c.JSON(http.StatusOK, map[string]string{"status": "deleted"})
}

// PATCH /api/v1/files/:id — update mutable fields (transcript, analysis, sub_type)
func (h *FilesHandler) Patch(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
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

	ctx := c.Request().Context()
	setClauses := []string{}
	args := []interface{}{}
	idx := 1

	if body.Transcript != nil {
		setClauses = append(setClauses, fmt.Sprintf("transcript = $%d", idx))
		args = append(args, *body.Transcript)
		idx++
	}
	if body.Analysis != nil {
		setClauses = append(setClauses, fmt.Sprintf("analysis = $%d", idx))
		args = append(args, *body.Analysis)
		idx++
	}
	if body.SubType != nil {
		setClauses = append(setClauses, fmt.Sprintf("sub_type = $%d", idx))
		args = append(args, *body.SubType)
		idx++
	}
	if body.Prompt != nil {
		setClauses = append(setClauses, fmt.Sprintf("prompt = $%d", idx))
		args = append(args, *body.Prompt)
		idx++
	}
	if len(setClauses) == 0 {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "nothing to update"})
	}

	args = append(args, c.Param("id"), userID)
	query := fmt.Sprintf(
		"UPDATE files SET %s WHERE id = $%d AND user_id = $%d",
		strings.Join(setClauses, ", "), idx, idx+1,
	)
	if _, err := h.db.ExecContext(ctx, query, args...); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "update failed"})
	}

	return c.JSON(http.StatusOK, map[string]string{"status": "updated"})
}

// POST /api/v1/files/:id/index — index a document file for search
func (h *FilesHandler) Index(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	ctx := c.Request().Context()

	var fileID int64
	var name, fileType, objectKey string
	err = h.db.QueryRowContext(ctx,
		`SELECT id, name, file_type, object_key FROM files WHERE id = $1 AND user_id = $2 AND file_type = 'document'`,
		c.Param("id"), userID,
	).Scan(&fileID, &name, &fileType, &objectKey)
	if err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "document not found"})
	}

	embCfg, embCfgErr := resolveEmbeddingConfig(ctx, h.db, userID.String(), h.config.EncryptionKey)
	embeddingEnabled := embCfgErr == nil

	text, err := h.extractText(ctx, objectKey, fileType)
	if err != nil {
		h.logger.Error("files: text extraction failed", zap.Int64("file", fileID), zap.Error(err))
		return c.JSON(http.StatusUnprocessableEntity, map[string]string{"error": "text extraction failed"})
	}
	if strings.TrimSpace(text) == "" {
		return c.JSON(http.StatusUnprocessableEntity, map[string]string{"error": "no text content found"})
	}

	chunks := chunkText(text, 1000, 200)
	if len(chunks) == 0 {
		return c.JSON(http.StatusUnprocessableEntity, map[string]string{"error": "no text chunks produced"})
	}

	tx, txErr := h.db.BeginTx(ctx, nil)
	if txErr != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to start transaction"})
	}

	if _, delErr := tx.ExecContext(ctx, `DELETE FROM file_sections WHERE file_id = $1`, fileID); delErr != nil {
		_ = tx.Rollback()
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to clear old index"})
	}

	successCount := 0
	for i, chunk := range chunks {
		metaBytes, _ := json.Marshal(map[string]any{
			"chunk":     i,
			"doc_title": name,
			"embedding": embeddingEnabled,
		})
		meta := string(metaBytes)

		var insErr error
		if embeddingEnabled {
			embedding, embErr := generateEmbeddingWithConfig(ctx, embCfg, chunk)
			if embErr != nil {
				h.logger.Warn("files: embedding failed, falling back", zap.Int("chunk", i), zap.Error(embErr))
				_, insErr = tx.ExecContext(ctx,
					`INSERT INTO file_sections (file_id, content, embedding, content_tsv, metadata)
					 VALUES ($1, $2, NULL, to_tsvector('simple', $2), $3::jsonb)`,
					fileID, chunk, meta,
				)
			} else {
				vecLit := vectorLiteral(embedding)
				_, insErr = tx.ExecContext(ctx,
					`INSERT INTO file_sections (file_id, content, embedding, content_tsv, metadata)
					 VALUES ($1, $2, $3::vector, to_tsvector('simple', $2), $4::jsonb)`,
					fileID, chunk, vecLit, meta,
				)
			}
		} else {
			_, insErr = tx.ExecContext(ctx,
				`INSERT INTO file_sections (file_id, content, embedding, content_tsv, metadata)
				 VALUES ($1, $2, NULL, to_tsvector('simple', $2), $3::jsonb)`,
				fileID, chunk, meta,
			)
		}

		if insErr != nil {
			h.logger.Warn("files: failed to insert section", zap.Int("chunk", i), zap.Error(insErr))
			continue
		}
		successCount++
	}

	if successCount == 0 {
		_ = tx.Rollback()
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to index any chunks"})
	}

	if _, updErr := tx.ExecContext(ctx, `UPDATE files SET indexed = TRUE WHERE id = $1`, fileID); updErr != nil {
		_ = tx.Rollback()
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to update indexed status"})
	}

	if cmtErr := tx.Commit(); cmtErr != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "transaction commit failed"})
	}

	searchMode := "full-text"
	if embeddingEnabled {
		searchMode = "semantic + full-text"
	}
	return c.JSON(http.StatusOK, map[string]any{
		"id": fileID, "indexed": true, "chunks": successCount,
		"embedding": embeddingEnabled, "search_mode": searchMode,
	})
}

// GET /api/v1/files/search?q=...&limit=10
func (h *FilesHandler) Search(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	q := strings.TrimSpace(c.QueryParam("q"))
	if q == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "q is required"})
	}
	if len(q) > 500 {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "query too long (max 500 chars)"})
	}
	limit, _ := strconv.Atoi(c.QueryParam("limit"))
	if limit < 1 || limit > 50 {
		limit = 10
	}

	ctx := c.Request().Context()

	var rows interface {
		Next() bool
		Scan(...any) error
		Close() error
	}
	var searchMode string

	if embCfg, embCfgErr := resolveEmbeddingConfig(ctx, h.db, userID.String(), h.config.EncryptionKey); embCfgErr == nil {
		embedding, embErr := generateEmbeddingWithConfig(ctx, embCfg, q)
		if embErr == nil {
			vecLit := vectorLiteral(embedding)
			r, qErr := h.db.QueryContext(ctx,
				`SELECT fs.id, fs.content, fs.metadata, f.id, f.name, f.file_type,
				        1 - (fs.embedding <=> $1::vector) AS similarity
				 FROM file_sections fs
				 JOIN files f ON f.id = fs.file_id
				 WHERE f.user_id = $2 AND fs.embedding IS NOT NULL
				 ORDER BY fs.embedding <=> $1::vector
				 LIMIT $3`,
				vecLit, userID, limit,
			)
			if qErr == nil {
				rows = r
				searchMode = "semantic"
			}
		}
	}

	if rows == nil {
		r, qErr := h.db.QueryContext(ctx,
			`SELECT fs.id, fs.content, fs.metadata, f.id, f.name, f.file_type,
			        ts_rank(fs.content_tsv, plainto_tsquery('simple', $1)) AS similarity
			 FROM file_sections fs
			 JOIN files f ON f.id = fs.file_id
			 WHERE f.user_id = $2
			   AND (fs.content_tsv @@ plainto_tsquery('simple', $1) OR fs.content ILIKE $4)
			 ORDER BY similarity DESC
			 LIMIT $3`,
			q, userID, limit, "%"+q+"%",
		)
		if qErr != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{"error": "search failed"})
		}
		rows = r
		searchMode = "full-text"
	}
	defer rows.Close()

	var results []map[string]any
	for rows.Next() {
		var sectionID, fileID int64
		var content, meta, fileName, fileType string
		var similarity float64
		if rows.Scan(&sectionID, &content, &meta, &fileID, &fileName, &fileType, &similarity) != nil {
			continue
		}
		results = append(results, map[string]any{
			"id": sectionID, "source": "file",
			"file_id": fileID, "file_name": fileName, "file_type": fileType,
			"content": content, "similarity": similarity,
		})
	}
	if results == nil {
		results = []map[string]any{}
	}

	return c.JSON(http.StatusOK, map[string]any{"results": results, "query": q, "search_mode": searchMode})
}

// extractText reads file bytes and extracts text content (same as documents handler).
func (h *FilesHandler) extractText(ctx context.Context, objectKey, fileType string) (string, error) {
	var data []byte
	var err error

	if h.minio != nil {
		obj, getErr := h.minio.GetObject(ctx, h.config.MinioBucket, objectKey, minio.GetObjectOptions{})
		if getErr != nil {
			return "", fmt.Errorf("failed to get object from MinIO: %w", getErr)
		}
		defer obj.Close()
		data, err = io.ReadAll(obj)
	} else {
		localPath := filepath.Join(h.config.SessionDir, "uploads", objectKey)
		data, err = os.ReadFile(localPath)
	}
	if err != nil {
		return "", fmt.Errorf("failed to read file: %w", err)
	}

	ext := strings.ToLower(fileType)
	switch ext {
	case "txt", "text", "md", "markdown", "csv":
		return string(data), nil
	}

	scriptPath := filepath.Join(h.config.SkillsDir, "documents", "scripts", "extract_text.py")
	filename := filepath.Base(objectKey)
	cmd := exec.CommandContext(ctx, "python3", scriptPath, "--ext", ext, "--filename", filename)
	cmd.Stdin = bytes.NewReader(data)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	out, cmdErr := cmd.Output()
	if cmdErr != nil {
		return "", fmt.Errorf("extract_text.py failed: %s", strings.TrimSpace(stderr.String()))
	}
	return strings.TrimSpace(string(out)), nil
}

// chunkText splits text into overlapping chunks for embedding indexing.
func chunkText(text string, chunkSize, overlap int) []string {
	runes := []rune(strings.TrimSpace(text))
	if len(runes) == 0 {
		return nil
	}
	step := chunkSize - overlap
	if step <= 0 {
		step = chunkSize
	}
	var chunks []string
	for i := 0; i < len(runes); i += step {
		end := i + chunkSize
		if end > len(runes) {
			end = len(runes)
		}
		chunk := strings.TrimSpace(string(runes[i:end]))
		if chunk != "" {
			chunks = append(chunks, chunk)
		}
		if end >= len(runes) {
			break
		}
	}
	return chunks
}
