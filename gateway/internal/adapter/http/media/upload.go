package media

import (
	"bytes"
	"fmt"
	"image"
	_ "image/gif" // gif decoder for compressImage
	"image/jpeg"
	_ "image/png" // png decoder for compressImage
	"io"
	"mime"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/newstarnion/gateway/internal/adapter/http/httpauth"
	"github.com/newstarnion/gateway/internal/domain/entity"
	"go.uber.org/zap"
	"golang.org/x/image/draw"
)

// ── Upload constants ─────────────────────────────────────────────

// maxUploadBytes caps the multipart-form upload size at 100 MB.
const maxUploadBytes = 100 * 1024 * 1024

// maxImageDimension is the maximum pixel length for either side of
// an uploaded image. Images exceeding this are downscaled while
// preserving aspect ratio. Anthropic Vision downsamples internally
// above ~1568px, so 2048 is a safe ceiling.
const maxImageDimension = 2048

// allowedMIMETypes is the whitelist of accepted upload MIME types.
var allowedMIMETypes = map[string]bool{
	"image/jpeg": true, "image/png": true, "image/gif": true, "image/webp": true,
	"application/pdf":    true,
	"text/plain":         true,
	"text/csv":           true,
	"application/msword": true,
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document": true,
	"application/vnd.ms-excel": true,
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":         true,
	"application/vnd.ms-powerpoint":                                             true,
	"application/vnd.openxmlformats-officedocument.presentationml.presentation": true,
	"audio/mpeg": true, "audio/wav": true, "audio/ogg": true,
	"video/mp4": true, "video/webm": true,
}

// upload accepts multipart/form-data with a "file" field. Stores
// to the media store (MinIO or local fallback), compresses images
// to JPEG q=85 max 2048px, and persists a row to either the
// `images` or `audios` table based on the resolved MIME type.
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

	// Determine MIME type.
	mimeType := file.Header.Get("Content-Type")
	if mimeType == "" || mimeType == "application/octet-stream" {
		mimeType = mime.TypeByExtension(filepath.Ext(file.Filename))
		if mimeType == "" {
			mimeType = "application/octet-stream"
		}
	}
	if !allowedMIMETypes[mimeType] {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "unsupported file type"})
	}

	// Compress images (resize + JPEG re-encode) before storage.
	// gif is left alone so animation frames are preserved.
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

	// Build object key: users/{user_id}/{year}/{uuid}{ext}.
	// Sanitize extension — alphanumerics + dot only.
	ext := sanitizeExt(filepath.Ext(file.Filename))
	if mimeType == "image/jpeg" && ext != ".jpg" && ext != ".jpeg" {
		ext = ".jpg"
	}
	objectKey := fmt.Sprintf("users/%s/%s/%s%s",
		userID, time.Now().Format("2006"), uuid.New().String(), ext)

	fileURL, err := h.store.Put(c.Request().Context(), objectKey, uploadReader, uploadSize, mimeType)
	if err != nil {
		h.logger.Error("media upload: storage put failed",
			zap.String("key", objectKey), zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "upload failed"})
	}

	// Classify and persist to the appropriate table.
	fileType := "file"
	switch {
	case strings.HasPrefix(mimeType, "image/"):
		fileType = "image"
		_ = h.uc.InsertImage(c.Request().Context(), userID, entity.ImageCreate{
			URL: fileURL, Name: file.Filename, MIME: mimeType,
			Size: uploadSize, Source: "upload", Type: "upload",
		})
	case strings.HasPrefix(mimeType, "audio/"), strings.HasPrefix(mimeType, "video/"):
		fileType = "audio"
		_ = h.uc.InsertAudio(c.Request().Context(), userID, entity.AudioCreate{
			URL: fileURL, Name: file.Filename, MIME: mimeType,
			Size: uploadSize, Duration: 0, Source: "upload", Type: "upload",
		})
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

// compressImage decodes an image from r, scales it so neither
// dimension exceeds maxImageDimension, then re-encodes it as JPEG
// quality 85. Pure Go — no CGO required.
func compressImage(r io.Reader) ([]byte, int64, error) {
	img, _, err := image.Decode(r)
	if err != nil {
		return nil, 0, fmt.Errorf("decode image: %w", err)
	}
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
		// ApproxBiLinear is ~3-4× faster than BiLinear with negligible
		// quality loss for downscale-only resizes. Drops the wall
		// clock on a 10 MB PNG from ~3s to ~800ms.
		draw.ApproxBiLinear.Scale(dst, dst.Bounds(), img, bounds, draw.Over, nil)
		img = dst
	}
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: 85}); err != nil {
		return nil, 0, fmt.Errorf("encode jpeg: %w", err)
	}
	b := buf.Bytes()
	return b, int64(len(b)), nil
}

// sanitizeExt strips anything except `.` and ASCII alphanumerics.
// Prevents path injection via filenames like "foo.txt/../../etc".
func sanitizeExt(raw string) string {
	out := ""
	for _, r := range raw {
		if r == '.' || (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') {
			out += string(r)
		}
	}
	return out
}
