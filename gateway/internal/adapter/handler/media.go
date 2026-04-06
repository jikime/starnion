package handler

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image"
	_ "image/gif"
	"image/jpeg"
	_ "image/png"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"github.com/newstarnion/gateway/config"
	"github.com/newstarnion/gateway/internal/crypto"
	"github.com/newstarnion/gateway/internal/infrastructure/database"
	"go.uber.org/zap"
	"golang.org/x/image/draw"
)

type MediaHandler struct {
	db     *database.DB
	config *config.Config
	logger *zap.Logger
	minio  *minio.Client
}

func NewMediaHandler(db *database.DB, cfg *config.Config, logger *zap.Logger) *MediaHandler {
	var minioClient *minio.Client
	if cfg.MinioAccessKey != "" {
		var err error
		minioClient, err = minio.New(cfg.MinioEndpoint, &minio.Options{
			Creds:  credentials.NewStaticV4(cfg.MinioAccessKey, cfg.MinioSecretKey, ""),
			Secure: cfg.MinioUseSSL,
		})
		if err != nil {
			logger.Warn("failed to init MinIO client", zap.Error(err))
		} else {
			// Ensure bucket exists
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			exists, _ := minioClient.BucketExists(ctx, cfg.MinioBucket)
			if !exists {
				if mkErr := minioClient.MakeBucket(ctx, cfg.MinioBucket, minio.MakeBucketOptions{}); mkErr != nil {
					logger.Warn("failed to create MinIO bucket", zap.String("bucket", cfg.MinioBucket), zap.Error(mkErr))
				}
			}
		}
	}
	return &MediaHandler{db: db, config: cfg, logger: logger, minio: minioClient}
}

// GET /api/v1/images?page=1&limit=20
func (h *MediaHandler) ListImages(c echo.Context) error {
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

	rows, err := h.db.QueryContext(c.Request().Context(),
		`SELECT id, url, name, mime, size, source, type, prompt, analysis, created_at
		 FROM images WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
		userID, limit, offset,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to fetch images"})
	}
	defer rows.Close()

	var images []map[string]any
	for rows.Next() {
		var id int64
		var url, name, mime, source, imgType string
		var size int64
		var prompt, analysis *string
		var createdAt time.Time
		if rows.Scan(&id, &url, &name, &mime, &size, &source, &imgType, &prompt, &analysis, &createdAt) != nil {
			continue
		}
		images = append(images, map[string]any{
			"id":         id,
			"url":        url,
			"name":       name,
			"mime":       mime,
			"size":       size,
			"source":     source,
			"type":       imgType,
			"prompt":     prompt,
			"analysis":   analysis,
			"created_at": createdAt,
		})
	}
	if images == nil {
		images = []map[string]any{}
	}

	var total int
	h.db.QueryRowContext(c.Request().Context(), `SELECT COUNT(*) FROM images WHERE user_id = $1`, userID).Scan(&total)

	return c.JSON(http.StatusOK, map[string]any{"images": images, "total": total, "page": page, "limit": limit})
}

// GET /api/v1/images/:id
func (h *MediaHandler) GetImage(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	var id int64
	var url, name, mime, source, imgType string
	var size int64
	var prompt, analysis *string
	var createdAt time.Time
	err = h.db.QueryRowContext(c.Request().Context(),
		`SELECT id, url, name, mime, size, source, type, prompt, analysis, created_at FROM images WHERE id = $1 AND user_id = $2`,
		c.Param("id"), userID,
	).Scan(&id, &url, &name, &mime, &size, &source, &imgType, &prompt, &analysis, &createdAt)
	if err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "image not found"})
	}
	return c.JSON(http.StatusOK, map[string]any{
		"id": id, "url": url, "name": name, "mime": mime, "size": size,
		"source": source, "type": imgType, "prompt": prompt, "analysis": analysis, "created_at": createdAt,
	})
}


// DELETE /api/v1/images/:id
func (h *MediaHandler) DeleteImage(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	_, err = h.db.ExecContext(c.Request().Context(),
		`DELETE FROM images WHERE id = $1 AND user_id = $2`, c.Param("id"), userID,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to delete image"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "deleted"})
}

// GET /api/v1/audios?page=1&limit=20
func (h *MediaHandler) ListAudios(c echo.Context) error {
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

	rows, err := h.db.QueryContext(c.Request().Context(),
		`SELECT id, url, name, mime, size, duration, source, type, transcript, created_at
		 FROM audios WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
		userID, limit, offset,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to fetch audios"})
	}
	defer rows.Close()

	var audios []map[string]any
	for rows.Next() {
		var id int64
		var url, name, mime, source, audioType string
		var size int64
		var duration int
		var transcript *string
		var createdAt time.Time
		if rows.Scan(&id, &url, &name, &mime, &size, &duration, &source, &audioType, &transcript, &createdAt) != nil {
			continue
		}
		audios = append(audios, map[string]any{
			"id":         id,
			"url":        url,
			"name":       name,
			"mime":       mime,
			"size":       size,
			"duration":   duration,
			"source":     source,
			"type":       audioType,
			"transcript": transcript,
			"created_at": createdAt,
		})
	}
	if audios == nil {
		audios = []map[string]any{}
	}

	var total int
	h.db.QueryRowContext(c.Request().Context(), `SELECT COUNT(*) FROM audios WHERE user_id = $1`, userID).Scan(&total)

	return c.JSON(http.StatusOK, map[string]any{"audios": audios, "total": total, "page": page, "limit": limit})
}

// GET /api/v1/audios/:id
func (h *MediaHandler) GetAudio(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	var id int64
	var url, name, mime, source, audioType string
	var size int64
	var duration int
	var transcript *string
	var createdAt time.Time
	err = h.db.QueryRowContext(c.Request().Context(),
		`SELECT id, url, name, mime, size, duration, source, type, transcript, created_at FROM audios WHERE id = $1 AND user_id = $2`,
		c.Param("id"), userID,
	).Scan(&id, &url, &name, &mime, &size, &duration, &source, &audioType, &transcript, &createdAt)
	if err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "audio not found"})
	}
	return c.JSON(http.StatusOK, map[string]any{
		"id": id, "url": url, "name": name, "mime": mime,
		"size": size, "duration": duration, "source": source,
		"type": audioType, "transcript": transcript, "created_at": createdAt,
	})
}

// GET /api/v1/audios/:id/transcript
func (h *MediaHandler) GetTranscript(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	var id int64
	var transcript *string
	err = h.db.QueryRowContext(c.Request().Context(),
		`SELECT id, transcript FROM audios WHERE id = $1 AND user_id = $2`, c.Param("id"), userID,
	).Scan(&id, &transcript)
	if err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "audio not found"})
	}
	if transcript == nil {
		return c.JSON(http.StatusOK, map[string]any{"id": id, "transcript": nil})
	}
	return c.JSON(http.StatusOK, map[string]any{"id": id, "transcript": *transcript})
}

// DELETE /api/v1/audios/:id
func (h *MediaHandler) DeleteAudio(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	_, err = h.db.ExecContext(c.Request().Context(),
		`DELETE FROM audios WHERE id = $1 AND user_id = $2`, c.Param("id"), userID,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to delete audio"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "deleted"})
}

// maxImageDimension is the maximum pixel length for either side of an uploaded image.
// Images exceeding this are downscaled while preserving aspect ratio.
// Anthropic Vision downsamples internally above ~1568px, so 2048 is a safe ceiling.
const maxImageDimension = 2048

// compressImage decodes an image from r, scales it so neither dimension exceeds
// maxImageDimension, then re-encodes it as JPEG (quality 85).
// Pure Go — no CGO required, safe for CGO_ENABLED=0 cross-compilation.
func compressImage(r io.Reader) ([]byte, int64, error) {
	img, _, err := image.Decode(r)
	if err != nil {
		return nil, 0, fmt.Errorf("decode image: %w", err)
	}

	// Resize if needed
	bounds := img.Bounds()
	w, h := bounds.Dx(), bounds.Dy()
	if w > maxImageDimension || h > maxImageDimension {
		if w >= h {
			h = h * maxImageDimension / w
			w = maxImageDimension
		} else {
			w = w * maxImageDimension / h
			h = maxImageDimension
		}
		dst := image.NewRGBA(image.Rect(0, 0, w, h))
		draw.BiLinear.Scale(dst, dst.Bounds(), img, bounds, draw.Over, nil)
		img = dst
	}

	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: 85}); err != nil {
		return nil, 0, fmt.Errorf("encode jpeg: %w", err)
	}
	b := buf.Bytes()
	return b, int64(len(b)), nil
}

// maxUploadBytes is the hard cap on file upload size (100 MB).
const maxUploadBytes = 100 * 1024 * 1024

// allowedMIMETypes is the whitelist of accepted upload MIME types.
var allowedMIMETypes = map[string]bool{
	"image/jpeg": true, "image/png": true, "image/gif": true, "image/webp": true,
	"application/pdf":      true,
	"text/plain":           true,
	"text/csv":             true,
	"application/msword":   true,
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document":    true,
	"application/vnd.ms-excel":                                                   true,
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":          true,
	"application/vnd.ms-powerpoint":                                              true,
	"application/vnd.openxmlformats-officedocument.presentationml.presentation":  true,
	"audio/mpeg": true, "audio/wav": true, "audio/ogg": true,
	"video/mp4": true, "video/webm": true,
}

// POST /api/v1/upload
// Accepts multipart/form-data with a "file" field.
// Stores to MinIO when configured, otherwise falls back to local disk.
// Images are converted to WebP (max 2048px, quality 85) before storage.
// Returns {"url", "name", "mime", "size", "key"}.
func (h *MediaHandler) Upload(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	file, err := c.FormFile("file")
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "file field is required"})
	}

	// Enforce file size limit before reading content.
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

	// Determine MIME type
	mimeType := file.Header.Get("Content-Type")
	if mimeType == "" || mimeType == "application/octet-stream" {
		mimeType = mime.TypeByExtension(filepath.Ext(file.Filename))
		if mimeType == "" {
			mimeType = "application/octet-stream"
		}
	}

	// Reject disallowed MIME types.
	if !allowedMIMETypes[mimeType] {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "unsupported file type"})
	}

	// Compress images (resize + JPEG re-encode) before storage.
	var uploadReader io.Reader = src
	uploadSize := file.Size
	if strings.HasPrefix(mimeType, "image/") && mimeType != "image/gif" {
		jpgBytes, jpgSize, convErr := compressImage(src)
		if convErr != nil {
			h.logger.Warn("image compression failed, using original", zap.Error(convErr))
			src2, _ := file.Open()
			defer src2.Close()
			uploadReader = src2
		} else {
			uploadReader = bytes.NewReader(jpgBytes)
			uploadSize = jpgSize
			mimeType = "image/jpeg"
		}
	}

	// Build object key: users/{user_id}/{year}/{uuid}{ext}
	// Sanitize extension: only keep alphanumeric chars to prevent path injection.
	rawExt := filepath.Ext(file.Filename)
	ext := ""
	for _, r := range rawExt {
		if r == '.' || (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') {
			ext += string(r)
		}
	}
	if mimeType == "image/jpeg" && ext != ".jpg" && ext != ".jpeg" {
		ext = ".jpg"
	}
	objectKey := fmt.Sprintf("users/%s/%s/%s%s",
		userID,
		time.Now().Format("2006"),
		uuid.New().String(),
		ext,
	)

	ctx := c.Request().Context()
	var fileURL string

	if h.minio != nil {
		// Upload to MinIO
		_, err = h.minio.PutObject(ctx, h.config.MinioBucket, objectKey, uploadReader, uploadSize,
			minio.PutObjectOptions{ContentType: mimeType},
		)
		if err != nil {
			h.logger.Error("MinIO upload failed", zap.String("key", objectKey), zap.Error(err))
			return c.JSON(http.StatusInternalServerError, map[string]string{"error": "upload failed"})
		}
		// If a public MinIO URL is configured, use it directly (no gateway proxy needed).
		if h.config.MinioPublicURL != "" {
			fileURL = h.config.MinioPublicURL + "/" + h.config.MinioBucket + "/" + objectKey
		} else {
			fileURL = "/api/files/" + objectKey
		}
	} else {
		// Fallback: save to local disk under SESSION_DIR/uploads/
		uploadDir := filepath.Join(h.config.SessionDir, "uploads", filepath.Dir(objectKey))
		if mkErr := os.MkdirAll(uploadDir, 0755); mkErr != nil {
			h.logger.Error("failed to create upload dir", zap.String("dir", uploadDir), zap.Error(mkErr))
			return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to create storage directory"})
		}
		destPath := filepath.Join(h.config.SessionDir, "uploads", objectKey)
		dest, mkErr := os.Create(destPath)
		if mkErr != nil {
			h.logger.Error("failed to create upload file", zap.String("path", destPath), zap.Error(mkErr))
			return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to save file"})
		}
		defer dest.Close()
		if _, cpErr := io.Copy(dest, uploadReader); cpErr != nil {
			h.logger.Error("failed to write upload file", zap.String("path", destPath), zap.Error(cpErr))
			return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to write file"})
		}
		fileURL = "/api/files/" + objectKey
		h.logger.Info("local upload saved", zap.String("path", destPath))
	}

	// Classify type for DB insert
	fileType := "file"
	if strings.HasPrefix(mimeType, "image/") {
		fileType = "image"
	} else if strings.HasPrefix(mimeType, "audio/") || strings.HasPrefix(mimeType, "video/") {
		fileType = "audio"
	}

	// Persist to images or audios table
	switch fileType {
	case "image":
		h.db.ExecContext(ctx,
			`INSERT INTO images (user_id, url, name, mime, size, source, type)
			 VALUES ($1, $2, $3, $4, $5, 'upload', 'upload')`,
			userID, fileURL, file.Filename, mimeType, uploadSize,
		)
	case "audio":
		h.db.ExecContext(ctx,
			`INSERT INTO audios (user_id, url, name, mime, size, duration, source, type)
			 VALUES ($1, $2, $3, $4, $5, 0, 'upload', 'upload')`,
			userID, fileURL, file.Filename, mimeType, uploadSize,
		)
	}

	return c.JSON(http.StatusOK, map[string]any{
		"url":  fileURL,
		"key":  objectKey,
		"name": file.Filename,
		"mime": mimeType,
		"size": uploadSize,
		"type": fileType,
	})
}

// Transcribe transcribes an audio file via OpenAI Whisper API.
// POST /api/v1/audios/transcribe
// Body: {"file_url": "/api/files/users/.../file.webm", "language": "ko"}
// Returns: {"text": "transcribed text"}
func (h *MediaHandler) Transcribe(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	var req struct {
		FileURL  string `json:"file_url"`
		Language string `json:"language"`
	}
	if err := c.Bind(&req); err != nil || req.FileURL == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "file_url is required"})
	}
	if req.Language == "" {
		req.Language = "ko"
	}
	if len(req.Language) > 10 {
		req.Language = req.Language[:10]
	}

	// Resolve which provider + key to use for STT.
	// Priority: OpenAI → Groq (both use the same multipart API format).
	type sttProvider struct {
		apiKey   string
		endpoint string
		model    string
	}
	var stt *sttProvider

	var openaiEncKey, groqEncKey string
	h.db.QueryRowContext(c.Request().Context(),
		`SELECT api_key FROM providers WHERE user_id = $1 AND provider = 'openai' LIMIT 1`,
		userID,
	).Scan(&openaiEncKey)
	h.db.QueryRowContext(c.Request().Context(),
		`SELECT api_key FROM providers WHERE user_id = $1 AND provider = 'groq' LIMIT 1`,
		userID,
	).Scan(&groqEncKey)

	var openaiKey, groqKey string
	if openaiEncKey != "" {
		if plain, decErr := crypto.Decrypt(openaiEncKey, h.config.EncryptionKey); decErr == nil {
			openaiKey = plain
		}
	}
	if groqEncKey != "" {
		if plain, decErr := crypto.Decrypt(groqEncKey, h.config.EncryptionKey); decErr == nil {
			groqKey = plain
		}
	}

	switch {
	case openaiKey != "":
		stt = &sttProvider{
			apiKey:   openaiKey,
			endpoint: "https://api.openai.com/v1/audio/transcriptions",
			model:    "gpt-4o-mini-transcribe",
		}
	case groqKey != "":
		stt = &sttProvider{
			apiKey:   groqKey,
			endpoint: "https://api.groq.com/openai/v1/audio/transcriptions",
			model:    "whisper-large-v3-turbo",
		}
	default:
		return c.JSON(http.StatusUnprocessableEntity, map[string]string{
			"error": "음성 변환을 위해 OpenAI 또는 Groq API 키가 필요합니다. Settings → 모델 → 프로바이더에서 설정해주세요.",
		})
	}

	// Open the audio file: local disk or MinIO.
	var audioReader io.ReadCloser
	var fileName string

	const localPrefix = "/api/files/"
	if strings.HasPrefix(req.FileURL, localPrefix) {
		// Strip the URL prefix, clean, then remove any leading slash so the
		// key is always relative (required for both MinIO and filepath.Join).
		objectKey := strings.TrimPrefix(req.FileURL, localPrefix)
		objectKey = strings.TrimPrefix(filepath.Clean("/"+objectKey), "/")
		fileName = filepath.Base(objectKey)

		if h.minio != nil {
			obj, merr := h.minio.GetObject(c.Request().Context(), h.config.MinioBucket, objectKey, minio.GetObjectOptions{})
			if merr != nil {
				return c.JSON(http.StatusNotFound, map[string]string{"error": "audio file not found"})
			}
			audioReader = obj
		} else {
			localPath := filepath.Join(h.config.SessionDir, "uploads", objectKey)
			f, ferr := os.Open(localPath)
			if ferr != nil {
				h.logger.Warn("audio file not found on disk", zap.String("path", localPath), zap.Error(ferr))
				return c.JSON(http.StatusNotFound, map[string]string{"error": "audio file not found"})
			}
			audioReader = f
		}
	} else if h.minio != nil && h.config.MinioPublicURL != "" && strings.HasPrefix(req.FileURL, h.config.MinioPublicURL) {
		// MinIO public URL — extract object key and fetch via MinIO client directly.
		bucketPrefix := h.config.MinioPublicURL + "/" + h.config.MinioBucket + "/"
		objectKey := strings.TrimPrefix(req.FileURL, bucketPrefix)
		objectKey = strings.TrimPrefix(filepath.Clean("/"+objectKey), "/")
		fileName = filepath.Base(objectKey)
		obj, merr := h.minio.GetObject(c.Request().Context(), h.config.MinioBucket, objectKey, minio.GetObjectOptions{})
		if merr != nil {
			return c.JSON(http.StatusNotFound, map[string]string{"error": "audio file not found"})
		}
		audioReader = obj
	} else {
		// External URL — validate scheme to prevent SSRF then download with context + size limit.
		if !strings.HasPrefix(req.FileURL, "https://") && !strings.HasPrefix(req.FileURL, "http://") {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": "file_url must start with http:// or https://"})
		}
		dlReq, dlErr := http.NewRequestWithContext(c.Request().Context(), http.MethodGet, req.FileURL, nil)
		if dlErr != nil {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid file_url"})
		}
		dlClient := &http.Client{Timeout: 30 * time.Second}
		resp, herr := dlClient.Do(dlReq)
		if herr != nil || resp.StatusCode != http.StatusOK {
			if resp != nil {
				_, _ = io.Copy(io.Discard, resp.Body)
				resp.Body.Close()
			}
			return c.JSON(http.StatusBadRequest, map[string]string{"error": "failed to fetch audio file"})
		}
		// Cap external download at 100 MB.
		audioReader = io.NopCloser(io.LimitReader(resp.Body, maxUploadBytes))
		fileName = filepath.Base(strings.Split(req.FileURL, "?")[0])
	}
	defer audioReader.Close()

	// Build multipart request to STT provider (OpenAI or Groq — same format).
	pr, pw := io.Pipe()
	mw := multipart.NewWriter(pw)

	go func() {
		defer pw.Close()
		defer mw.Close()
		fw, _ := mw.CreateFormFile("file", fileName)
		io.Copy(fw, audioReader)          //nolint:errcheck
		mw.WriteField("model", stt.model) //nolint:errcheck
		mw.WriteField("language", req.Language) //nolint:errcheck
	}()

	whisperReq, _ := http.NewRequestWithContext(c.Request().Context(), http.MethodPost,
		stt.endpoint, pr)
	whisperReq.Header.Set("Authorization", "Bearer "+stt.apiKey)
	whisperReq.Header.Set("Content-Type", mw.FormDataContentType())

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(whisperReq)
	if err != nil {
		h.logger.Error("Whisper API request failed", zap.Error(err))
		return c.JSON(http.StatusBadGateway, map[string]string{"error": "transcription failed"})
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		h.logger.Warn("Whisper API error", zap.Int("status", resp.StatusCode), zap.String("body", string(body)))
		return c.JSON(http.StatusBadGateway, map[string]string{"error": "transcription failed: " + string(body)})
	}

	var result struct {
		Text string `json:"text"`
	}
	if jerr := json.Unmarshal(body, &result); jerr != nil {
		return c.JSON(http.StatusBadGateway, map[string]string{"error": "invalid transcription response"})
	}

	return c.JSON(http.StatusOK, map[string]string{"text": result.Text})
}

// TTS converts text to speech using the OpenAI TTS API and streams audio back.
// POST /api/v1/audios/tts
// Body: {"text": "...", "voice": "nova", "model": "tts-1"}
// Streams audio/mpeg directly from OpenAI.
func (h *MediaHandler) TTS(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	var req struct {
		Text  string `json:"text"`
		Voice string `json:"voice"`
		Model string `json:"model"`
	}
	if err := c.Bind(&req); err != nil || strings.TrimSpace(req.Text) == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "text is required"})
	}
	if req.Voice == "" {
		req.Voice = "nova"
	}
	if req.Model == "" {
		req.Model = "tts-1"
	}

	// Resolve OpenAI key — TTS only supported by OpenAI.
	var openaiEncKey string
	h.db.QueryRowContext(c.Request().Context(),
		`SELECT api_key FROM providers WHERE user_id = $1 AND provider = 'openai' LIMIT 1`,
		userID,
	).Scan(&openaiEncKey)

	if openaiEncKey == "" {
		return c.JSON(http.StatusUnprocessableEntity, map[string]string{
			"error": "TTS를 사용하려면 OpenAI API 키가 필요합니다. Settings → 모델 → 프로바이더에서 설정해주세요.",
		})
	}
	openaiKey, decErr := crypto.Decrypt(openaiEncKey, h.config.EncryptionKey)
	if decErr != nil || openaiKey == "" {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to decrypt API key"})
	}

	// Cap text length to avoid excessive API costs (≈ 4000 chars ≈ 1000 tokens).
	const maxTextLen = 4096
	if len(req.Text) > maxTextLen {
		req.Text = req.Text[:maxTextLen]
	}

	// Build OpenAI TTS request.
	ttsBody, _ := json.Marshal(map[string]string{
		"model": req.Model,
		"input": req.Text,
		"voice": req.Voice,
	})
	ttsReq, _ := http.NewRequestWithContext(c.Request().Context(),
		http.MethodPost, "https://api.openai.com/v1/audio/speech", bytes.NewReader(ttsBody))
	ttsReq.Header.Set("Authorization", "Bearer "+openaiKey)
	ttsReq.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(ttsReq)
	if err != nil {
		h.logger.Error("OpenAI TTS request failed", zap.Error(err))
		return c.JSON(http.StatusBadGateway, map[string]string{"error": "TTS request failed"})
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		errBody, _ := io.ReadAll(resp.Body)
		h.logger.Warn("OpenAI TTS error", zap.Int("status", resp.StatusCode), zap.String("body", string(errBody)))
		return c.JSON(http.StatusBadGateway, map[string]string{"error": "TTS failed: " + string(errBody)})
	}

	// Stream audio/mpeg response directly to client.
	c.Response().Header().Set("Content-Type", "audio/mpeg")
	c.Response().Header().Set("Transfer-Encoding", "chunked")
	c.Response().WriteHeader(http.StatusOK)
	_, _ = io.Copy(c.Response(), resp.Body)
	return nil
}

// ServeFile serves uploaded files stored locally (fallback when MinIO is not configured).
// GET /api/files/*
//
// Access control:
//   - browser/screenshots/* — public (Telegram embeds these URLs in messages)
//   - everything else       — JWT required; path must start with users/<jwt.UserID>/
func (h *MediaHandler) ServeFile(c echo.Context) error {
	// Extract the object key from the wildcard path param
	objectKey := c.Param("*")
	if objectKey == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "missing file path"})
	}

	// Only browser/screenshots/ paths are exempt from auth.
	if !strings.HasPrefix(objectKey, "browser/screenshots/") {
		// Accept JWT from Authorization header or ?token= query param (WS-style).
		tokenStr := c.QueryParam("token")
		if tokenStr == "" {
			if auth := c.Request().Header.Get("Authorization"); strings.HasPrefix(auth, "Bearer ") {
				tokenStr = strings.TrimPrefix(auth, "Bearer ")
			}
		}
		if tokenStr == "" {
			return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		}
		tok, err := jwt.ParseWithClaims(tokenStr, &JWTClaims{}, func(t *jwt.Token) (any, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
			}
			return []byte(h.config.JWTSecret), nil
		})
		if err != nil || !tok.Valid {
			return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		}
		claims, ok := tok.Claims.(*JWTClaims)
		if !ok {
			return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		}
		// Verify ownership: object key must be scoped to this user.
		if !strings.HasPrefix(objectKey, "users/"+claims.UserID+"/") {
			return c.JSON(http.StatusForbidden, map[string]string{"error": "forbidden"})
		}
	}

	if h.minio != nil {
		// Proxy from MinIO
		ctx := c.Request().Context()
		obj, err := h.minio.GetObject(ctx, h.config.MinioBucket, objectKey, minio.GetObjectOptions{})
		if err != nil {
			return c.JSON(http.StatusNotFound, map[string]string{"error": "file not found"})
		}
		defer obj.Close()
		info, err := obj.Stat()
		if err != nil {
			return c.JSON(http.StatusNotFound, map[string]string{"error": "file not found"})
		}
		return c.Stream(http.StatusOK, info.ContentType, obj)
	}

	// Serve from local disk
	filePath := filepath.Join(h.config.SessionDir, "uploads", filepath.Clean("/"+objectKey))
	return c.File(filePath)
}

// InternalUploadScreenshot saves a base64 browser screenshot to MinIO.
// POST /api/v1/internal/upload-screenshot
// Protected by X-Internal-Secret header (same as /internal/logs).
// Request:  {"data": "<base64>", "format": "png"|"jpeg"}
// Response: {"url": "/api/files/browser/screenshots/<uuid>.png"}
func (h *MediaHandler) InternalUploadScreenshot(c echo.Context) error {
	var req struct {
		Data      string `json:"data"`
		Format    string `json:"format"`
		SessionID string `json:"session_id"`
	}
	if err := c.Bind(&req); err != nil || req.Data == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "data is required"})
	}

	imgBytes, err := base64.StdEncoding.DecodeString(req.Data)
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid base64 data"})
	}

	format := "png"
	contentType := "image/png"
	if req.Format == "jpeg" || req.Format == "jpg" {
		format = "jpeg"
		contentType = "image/jpeg"
	}

	objectKey := fmt.Sprintf("browser/screenshots/%s.%s", uuid.New().String(), format)

	if h.minio != nil {
		ctx := c.Request().Context()
		_, putErr := h.minio.PutObject(
			ctx, h.config.MinioBucket, objectKey,
			bytes.NewReader(imgBytes), int64(len(imgBytes)),
			minio.PutObjectOptions{ContentType: contentType},
		)
		if putErr != nil {
			h.logger.Error("InternalUploadScreenshot: MinIO put failed",
				zap.String("key", objectKey), zap.Error(putErr))
			return c.JSON(http.StatusInternalServerError, map[string]string{"error": "upload failed"})
		}
	} else {
		// Fallback: write to local uploads dir (use same objectKey for consistent URL)
		localDir := filepath.Join(h.config.SessionDir, "uploads", "browser", "screenshots")
		if mkErr := os.MkdirAll(localDir, 0o755); mkErr != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{"error": "storage unavailable"})
		}
		localPath := filepath.Join(h.config.SessionDir, "uploads", objectKey)
		if writeErr := os.WriteFile(localPath, imgBytes, 0o644); writeErr != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{"error": "storage unavailable"})
		}
	}

	relativePath := "/api/files/" + objectKey
	fileURL := relativePath
	if h.config.PublicURL != "" {
		fileURL = h.config.PublicURL + relativePath
	}

	// Save to images table if session_id is provided (look up user_id from conversations).
	if req.SessionID != "" {
		var userID string
		if err := h.db.QueryRowContext(c.Request().Context(),
			`SELECT user_id FROM conversations WHERE id = $1 LIMIT 1`,
			req.SessionID,
		).Scan(&userID); err == nil && userID != "" {
			mimeType := "image/png"
			if format == "jpeg" {
				mimeType = "image/jpeg"
			}
			h.db.ExecContext(c.Request().Context(),
				`INSERT INTO images (user_id, url, name, mime, size, source, type)
				 VALUES ($1, $2, $3, $4, $5, 'browser', 'screenshot')`,
				userID, fileURL, filepath.Base(objectKey), mimeType, int64(len(imgBytes)),
			)
		}
	}

	return c.JSON(http.StatusOK, map[string]string{
		"url": fileURL,
	})
}
