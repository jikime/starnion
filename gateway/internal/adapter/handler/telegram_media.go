package handler

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"path"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/minio/minio-go/v7"
	"github.com/newstarnion/gateway/config"
	"github.com/newstarnion/gateway/internal/infrastructure/telegram"
)

// typingLoop sends a "typing" chat action every 4 seconds until ctx is cancelled.
func (h *TelegramHandler) typingLoop(ctx context.Context, tg *telegram.Client, chatID int64) {
	if err := tg.SendChatAction(chatID, "typing"); err != nil {
		return // circuit-break if first attempt fails
	}
	ticker := time.NewTicker(4 * time.Second)
	defer ticker.Stop()
	failures := 0
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := tg.SendChatAction(chatID, "typing"); err != nil {
				failures++
				if failures >= 3 {
					return
				}
			} else {
				failures = 0
			}
		}
	}
}

// imageMatch holds a parsed ![alt](url) from the agent reply.
type imageMatch struct {
	alt  string
	path string // e.g. /api/files/users/UUID/2026/file.jpg
}

// extractImages parses all ![alt](.../api/files/...) occurrences from text.
// Matches both relative paths (/api/files/...) and full URLs (http://host/api/files/...).
// Also matches bare URLs in backtick code spans (fallback for when the agent forgets markdown image syntax).
var imageMarkdownRe = regexp.MustCompile(`!\[([^\]]*)\]\(((?:https?://[^/)]+)?/api/files/[^)]+)\)`)
var imageBareURLRe = regexp.MustCompile("`((?:https?://[^`]+)?/api/files/browser/screenshots/[^`]+)`")

func extractImages(text string) []imageMatch {
	var out []imageMatch
	seen := map[string]bool{}
	for _, m := range imageMarkdownRe.FindAllStringSubmatch(text, -1) {
		if !seen[m[2]] {
			out = append(out, imageMatch{alt: m[1], path: m[2]})
			seen[m[2]] = true
		}
	}
	// Fallback: backtick-wrapped screenshot URLs (e.g. `http://host/api/files/browser/screenshots/uuid.png`)
	for _, m := range imageBareURLRe.FindAllStringSubmatch(text, -1) {
		if !seen[m[1]] {
			out = append(out, imageMatch{alt: "스크린샷", path: m[1]})
			seen[m[1]] = true
		}
	}
	return out
}

// removeImageMarkdown strips all ![alt](...) blocks from text.
func removeImageMarkdown(text string) string {
	cleaned := imageMarkdownRe.ReplaceAllString(text, "")
	// collapse multiple blank lines left behind
	blankRe := regexp.MustCompile(`\n{3,}`)
	return strings.TrimSpace(blankRe.ReplaceAllString(cleaned, "\n\n"))
}

// ── Audio extraction ─────────────────────────────────────────────────────────

type audioMatch struct {
	name string
	path string
}

// audioLinkRe matches [text](.../api/files/...mp3|ogg|wav|m4a|flac|webm) links.
var audioLinkRe = regexp.MustCompile(`\[([^\]]*)\]\(((?:https?://[^/)]+)?/api/files/[^)]+\.(?:mp3|ogg|wav|m4a|flac|webm))\)`)

func extractAudio(text string) []audioMatch {
	var out []audioMatch
	seen := map[string]bool{}
	for _, m := range audioLinkRe.FindAllStringSubmatch(text, -1) {
		if !seen[m[2]] {
			out = append(out, audioMatch{name: m[1], path: m[2]})
			seen[m[2]] = true
		}
	}
	return out
}

func removeAudioMarkdown(text string) string {
	cleaned := audioLinkRe.ReplaceAllString(text, "")
	blankRe := regexp.MustCompile(`\n{3,}`)
	return strings.TrimSpace(blankRe.ReplaceAllString(cleaned, "\n\n"))
}

// docMatch holds a parsed [name](url) document link from the agent reply.
type docMatch struct {
	name string
	path string // e.g. /api/files/users/UUID/docs/2026/file.md
}

// docLinkRe matches [text](.../api/files/...) links to document file types.
// Matches both relative paths and full URLs.
var docLinkRe = regexp.MustCompile(`\[([^\]]+)\]\(((?:https?://[^/)]+)?/api/files/[^)]+\.(?:md|txt|pdf|docx|xlsx|csv|pptx|html|json))\)`)

func extractDocLinks(text string) []docMatch {
	var out []docMatch
	for _, m := range docLinkRe.FindAllStringSubmatch(text, -1) {
		out = append(out, docMatch{name: m[1], path: m[2]})
	}
	return out
}

func removeDocLinks(text string) string {
	cleaned := docLinkRe.ReplaceAllString(text, "")
	blankRe := regexp.MustCompile(`\n{3,}`)
	return strings.TrimSpace(blankRe.ReplaceAllString(cleaned, "\n\n"))
}

// downloadFromMinio fetches an image stored in MinIO.
// imgPath may be a relative path (/api/files/...) or a full URL (http://host/api/files/...).
func downloadFromMinio(cfg *config.Config, imgPath string) ([]byte, string, error) {
	// Extract the MinIO object key from either a relative path or a full URL.
	const marker = "/api/files/"
	idx := strings.Index(imgPath, marker)
	if idx == -1 {
		return nil, "", fmt.Errorf("unsupported image path: %s", imgPath)
	}
	objectKey := imgPath[idx+len(marker):]
	scheme := "http"
	if cfg.MinioUseSSL {
		scheme = "https"
	}
	url := fmt.Sprintf("%s://%s/%s/%s", scheme, cfg.MinioEndpoint, cfg.MinioBucket, objectKey)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, "", fmt.Errorf("minio download: build request: %w", err)
	}
	resp, err := fileDownloadClient.Do(req)
	if err != nil {
		return nil, "", fmt.Errorf("minio download: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, "", fmt.Errorf("minio download: status %d for %s", resp.StatusCode, url)
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, maxFileDownloadBytes))
	if err != nil {
		return nil, "", fmt.Errorf("minio read: %w", err)
	}
	return data, path.Base(objectKey), nil
}

// downloadTelegramFile downloads a file from Telegram by its file_id.
// Returns raw bytes, content-type, and the filename from the URL path.
func (h *TelegramHandler) downloadTelegramFile(tg *telegram.Client, fileID string) ([]byte, string, string, error) {
	fileURL, err := tg.GetFileURL(fileID)
	if err != nil {
		return nil, "", "", fmt.Errorf("get file URL: %w", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, fileURL, nil)
	if err != nil {
		return nil, "", "", fmt.Errorf("download telegram file: build request: %w", err)
	}
	resp, err := fileDownloadClient.Do(req)
	if err != nil {
		return nil, "", "", fmt.Errorf("download telegram file: %w", err)
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, maxFileDownloadBytes))
	if err != nil {
		return nil, "", "", fmt.Errorf("read telegram file: %w", err)
	}
	filename := path.Base(strings.SplitN(fileURL, "?", 2)[0])
	ct := resp.Header.Get("Content-Type")
	if idx := strings.Index(ct, ";"); idx != -1 {
		ct = strings.TrimSpace(ct[:idx])
	}
	// Infer MIME type from file extension when header is absent or generic
	if ct == "" || ct == "application/octet-stream" {
		switch strings.ToLower(path.Ext(filename)) {
		case ".jpg", ".jpeg":
			ct = "image/jpeg"
		case ".png":
			ct = "image/png"
		case ".gif":
			ct = "image/gif"
		case ".webp":
			ct = "image/webp"
		case ".pdf":
			ct = "application/pdf"
		case ".mp4":
			ct = "video/mp4"
		case ".ogg", ".oga", ".opus":
			ct = "audio/ogg"
		case ".mp3":
			ct = "audio/mpeg"
		case ".m4a", ".aac":
			ct = "audio/mp4"
		case ".wav":
			ct = "audio/wav"
		case ".flac":
			ct = "audio/flac"
		case ".webm":
			ct = "audio/webm"
		default:
			ct = "application/octet-stream"
		}
	}
	return data, ct, filename, nil
}

// uploadToMinio uploads bytes to MinIO under users/<userID>/telegram/<year>/<uuid><ext>
// and returns the /api/files/... relative URL.
func (h *TelegramHandler) uploadToMinio(ctx context.Context, data []byte, mimeType, userID string) (string, error) {
	if h.minio == nil {
		return "", fmt.Errorf("minio not configured")
	}
	ext := ".bin"
	switch mimeType {
	case "image/jpeg":
		ext = ".jpg"
	case "image/png":
		ext = ".png"
	case "image/gif":
		ext = ".gif"
	case "image/webp":
		ext = ".webp"
	case "application/pdf":
		ext = ".pdf"
	case "video/mp4":
		ext = ".mp4"
	case "audio/ogg":
		ext = ".ogg"
	case "audio/mpeg":
		ext = ".mp3"
	case "audio/mp4":
		ext = ".m4a"
	case "audio/wav":
		ext = ".wav"
	case "audio/webm":
		ext = ".webm"
	}
	objectKey := fmt.Sprintf("users/%s/telegram/%s/%s%s",
		userID, time.Now().Format("2006"), uuid.New().String(), ext)
	_, err := h.minio.PutObject(ctx, h.config.MinioBucket, objectKey,
		bytes.NewReader(data), int64(len(data)),
		minio.PutObjectOptions{ContentType: mimeType})
	if err != nil {
		return "", fmt.Errorf("minio put: %w", err)
	}
	return "/api/files/" + objectKey, nil
}
