package media

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"mime/multipart"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/newstarnion/gateway/internal/adapter/http/httpauth"
	"github.com/newstarnion/gateway/internal/domain"
	"go.uber.org/zap"
)

// transcribe handles POST /api/v1/audios/transcribe. It resolves
// the user's configured STT provider (OpenAI preferred, Groq as
// fallback), streams the audio bytes into a multipart upload, and
// returns the transcribed text.
func (h *Handler) transcribe(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
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

	stt, err := h.uc.ResolveSTT(c.Request().Context(), userID)
	if err != nil {
		if errors.Is(err, domain.ErrUnavailable) {
			return c.JSON(http.StatusUnprocessableEntity, map[string]string{
				"error": "음성 변환을 위해 OpenAI 또는 Groq API 키가 필요합니다. Settings → 모델 → 프로바이더에서 설정해주세요.",
			})
		}
		h.logger.Error("transcribe: resolve STT failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to resolve STT provider"})
	}

	endpoint := "https://api.openai.com/v1/audio/transcriptions"
	model := "gpt-4o-mini-transcribe"
	if stt.Vendor == "groq" {
		endpoint = "https://api.groq.com/openai/v1/audio/transcriptions"
		model = "whisper-large-v3-turbo"
	}

	audioReader, fileName, err := h.openAudioFromURL(c.Request().Context(), req.FileURL)
	if err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{"error": err.Error()})
	}
	defer audioReader.Close()

	// Stream the multipart body into the STT provider via a pipe so
	// we never buffer the whole audio in memory.
	pr, pw := io.Pipe()
	mw := multipart.NewWriter(pw)
	go func() {
		defer pw.Close()
		defer mw.Close()
		fw, _ := mw.CreateFormFile("file", fileName)
		_, _ = io.Copy(fw, audioReader)
		_ = mw.WriteField("model", model)
		_ = mw.WriteField("language", req.Language)
	}()

	whisperReq, _ := http.NewRequestWithContext(c.Request().Context(), http.MethodPost, endpoint, pr)
	whisperReq.Header.Set("Authorization", "Bearer "+stt.APIKey)
	whisperReq.Header.Set("Content-Type", mw.FormDataContentType())

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(whisperReq)
	if err != nil {
		h.logger.Error("whisper API request failed", zap.Error(err))
		return c.JSON(http.StatusBadGateway, map[string]string{"error": "transcription failed"})
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		h.logger.Warn("whisper API error", zap.Int("status", resp.StatusCode), zap.String("body", string(body)))
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

// openAudioFromURL resolves `fileURL` to a ReadCloser, choosing
// between (a) the media store for /api/files/* and MinIO public
// URLs, or (b) an outbound HTTP GET for anything else. External
// downloads are capped at maxUploadBytes to bound memory.
func (h *Handler) openAudioFromURL(ctx context.Context, fileURL string) (io.ReadCloser, string, error) {
	const localPrefix = "/api/files/"
	if strings.HasPrefix(fileURL, localPrefix) {
		objectKey := strings.TrimPrefix(fileURL, localPrefix)
		objectKey = strings.TrimPrefix(filepath.Clean("/"+objectKey), "/")
		fileName := filepath.Base(objectKey)
		obj, err := h.store.Get(ctx, objectKey)
		if err != nil {
			return nil, "", errors.New("audio file not found")
		}
		return obj.Body, fileName, nil
	}
	if h.store.Enabled() && h.cfg.MinioPublicURL != "" &&
		strings.HasPrefix(fileURL, h.cfg.MinioPublicURL+"/"+h.cfg.MinioBucket+"/") {
		objectKey := strings.TrimPrefix(fileURL, h.cfg.MinioPublicURL+"/"+h.cfg.MinioBucket+"/")
		objectKey = strings.TrimPrefix(filepath.Clean("/"+objectKey), "/")
		fileName := filepath.Base(objectKey)
		obj, err := h.store.Get(ctx, objectKey)
		if err != nil {
			return nil, "", errors.New("audio file not found")
		}
		return obj.Body, fileName, nil
	}
	// External URL — validate scheme then download with context + size limit.
	if !strings.HasPrefix(fileURL, "https://") && !strings.HasPrefix(fileURL, "http://") {
		return nil, "", errors.New("file_url must start with http:// or https://")
	}
	dlReq, dlErr := http.NewRequestWithContext(ctx, http.MethodGet, fileURL, nil)
	if dlErr != nil {
		return nil, "", errors.New("invalid file_url")
	}
	dlClient := &http.Client{Timeout: 30 * time.Second}
	resp, herr := dlClient.Do(dlReq)
	if herr != nil || resp.StatusCode != http.StatusOK {
		if resp != nil {
			_, _ = io.Copy(io.Discard, resp.Body)
			resp.Body.Close()
		}
		return nil, "", errors.New("failed to fetch audio file")
	}
	fileName := filepath.Base(strings.Split(fileURL, "?")[0])
	return &limitedBody{r: io.LimitReader(resp.Body, maxUploadBytes), base: resp.Body}, fileName, nil
}

// limitedBody wraps the LimitReader output in a ReadCloser so the
// caller can defer a single Close() without tracking the original
// response body separately.
type limitedBody struct {
	r    io.Reader
	base io.Closer
}

func (l *limitedBody) Read(p []byte) (int, error) { return l.r.Read(p) }
func (l *limitedBody) Close() error               { return l.base.Close() }

// tts handles POST /api/v1/audios/tts. Only OpenAI is supported
// because Groq does not offer a TTS API. The response is streamed
// straight through as audio/mpeg so the client can start playing
// before the full synthesis finishes.
func (h *Handler) tts(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
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

	openaiKey, err := h.uc.ResolveOpenAIKey(c.Request().Context(), userID)
	if err != nil {
		if errors.Is(err, domain.ErrUnavailable) {
			return c.JSON(http.StatusUnprocessableEntity, map[string]string{
				"error": "TTS를 사용하려면 OpenAI API 키가 필요합니다. Settings → 모델 → 프로바이더에서 설정해주세요.",
			})
		}
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to decrypt API key"})
	}

	// Cap text length to bound API cost (≈ 4000 chars ≈ 1000 tokens).
	const maxTextLen = 4096
	if len(req.Text) > maxTextLen {
		req.Text = req.Text[:maxTextLen]
	}

	ttsBody, _ := json.Marshal(map[string]string{
		"model": req.Model,
		"input": req.Text,
		"voice": req.Voice,
	})
	ttsReq, _ := http.NewRequestWithContext(c.Request().Context(), http.MethodPost,
		"https://api.openai.com/v1/audio/speech", bytes.NewReader(ttsBody))
	ttsReq.Header.Set("Authorization", "Bearer "+openaiKey)
	ttsReq.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(ttsReq)
	if err != nil {
		h.logger.Error("openai tts request failed", zap.Error(err))
		return c.JSON(http.StatusBadGateway, map[string]string{"error": "TTS request failed"})
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		errBody, _ := io.ReadAll(resp.Body)
		h.logger.Warn("openai tts error", zap.Int("status", resp.StatusCode), zap.String("body", string(errBody)))
		return c.JSON(http.StatusBadGateway, map[string]string{"error": "TTS failed: " + string(errBody)})
	}

	c.Response().Header().Set("Content-Type", "audio/mpeg")
	c.Response().Header().Set("Transfer-Encoding", "chunked")
	c.Response().WriteHeader(http.StatusOK)
	_, _ = io.Copy(c.Response(), resp.Body)
	return nil
}
