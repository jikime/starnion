package media

import (
	"encoding/base64"
	"fmt"
	"net/http"
	"path/filepath"
	"strings"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/newstarnion/gateway/internal/adapter/http/httpauth"
	"github.com/newstarnion/gateway/internal/adapter/http/signedurl"
	"github.com/newstarnion/gateway/internal/domain/entity"
	"go.uber.org/zap"
)

// ServeFile is mounted by the router on the root echo instance
// under GET /api/files/* because stored URLs use that prefix. It is
// NOT part of the protected Register group.
//
// Access control:
//   - browser/screenshots/*  — public (Telegram embeds these URLs
//     in messages that render without the user being logged in).
//   - everything else        — HMAC signed URL or legacy JWT. The
//     signed URL path binds the user id to the object-key prefix.
func (h *Handler) ServeFile(c echo.Context) error {
	objectKey := c.Param("*")
	if objectKey == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "missing file path"})
	}

	if !strings.HasPrefix(objectKey, "browser/screenshots/") {
		if sig := c.QueryParam("sig"); sig != "" {
			ownerID := signedurl.UserIDFromObjectKey(objectKey)
			if ownerID == "" {
				return c.JSON(http.StatusForbidden, map[string]string{"error": "object key not user-scoped"})
			}
			if err := signedurl.Verify(objectKey, ownerID, h.cfg.JWTSecret, c.QueryParams()); err != nil {
				if err == signedurl.ErrExpired {
					return c.JSON(http.StatusUnauthorized, map[string]string{"error": "signed url expired"})
				}
				return c.JSON(http.StatusUnauthorized, map[string]string{"error": "invalid signature"})
			}
		} else {
			// Legacy JWT path — still supported for Telegram bot
			// delivery and direct CLI downloads. Emits a
			// deprecation warning when the token is smuggled via
			// the URL query (the S-H3 vector).
			tokenStr := c.QueryParam("token")
			if tokenStr != "" {
				h.logger.Warn("deprecated: JWT provided via ?token= query on /api/files/*",
					zap.String("object_key", objectKey),
					zap.String("remote", c.RealIP()))
			}
			if tokenStr == "" {
				if auth := c.Request().Header.Get("Authorization"); strings.HasPrefix(auth, "Bearer ") {
					tokenStr = strings.TrimPrefix(auth, "Bearer ")
				}
			}
			if tokenStr == "" {
				return unauthorized(c)
			}
			tok, err := jwt.ParseWithClaims(tokenStr, &httpauth.Claims{}, func(t *jwt.Token) (any, error) {
				if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
					return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
				}
				return []byte(h.cfg.JWTSecret), nil
			})
			if err != nil || !tok.Valid {
				return unauthorized(c)
			}
			claims, ok := tok.Claims.(*httpauth.Claims)
			if !ok {
				return unauthorized(c)
			}
			if !strings.HasPrefix(objectKey, "users/"+claims.UserID+"/") {
				return c.JSON(http.StatusForbidden, map[string]string{"error": "forbidden"})
			}
		}
	}

	// Stream from the media store. When running in filesystem mode
	// we use echo.Context.File for correct Content-Type detection
	// (the store doesn't track MIME on the local path).
	if path := h.store.ServeFilePath(objectKey); path != "" {
		return c.File(path)
	}
	obj, err := h.store.Get(c.Request().Context(), objectKey)
	if err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "file not found"})
	}
	defer obj.Body.Close()
	return c.Stream(http.StatusOK, obj.ContentType, obj.Body)
}

// InternalUploadScreenshot saves a base64 browser screenshot to the
// media store under `browser/screenshots/<uuid>.<ext>`. Protected
// by the X-Internal-Secret header when mounted by the router.
func (h *Handler) InternalUploadScreenshot(c echo.Context) error {
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
	if _, err := h.store.PutBytes(c.Request().Context(), objectKey, imgBytes, contentType); err != nil {
		h.logger.Error("screenshot upload failed", zap.String("key", objectKey), zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "upload failed"})
	}

	relativePath := "/api/files/" + objectKey
	fileURL := relativePath
	if h.cfg.PublicURL != "" {
		fileURL = h.cfg.PublicURL + relativePath
	}

	// Persist to the images table when we can resolve a user id
	// from the provided session id. Missing session ids are
	// tolerated — matches legacy behaviour.
	if req.SessionID != "" {
		if userID, _ := h.uc.UserIDByConversation(c.Request().Context(), req.SessionID); userID != "" {
			_ = h.uc.InsertImageForUserID(c.Request().Context(), userID, entity.ImageCreate{
				URL:    fileURL,
				Name:   filepath.Base(objectKey),
				MIME:   contentType,
				Size:   int64(len(imgBytes)),
				Source: "browser",
				Type:   "screenshot",
			})
		}
	}

	return c.JSON(http.StatusOK, map[string]string{"url": fileURL})
}
