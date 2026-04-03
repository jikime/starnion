package handler

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"path"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"github.com/newstarnion/gateway/config"
	"github.com/newstarnion/gateway/internal/crypto"
	"github.com/newstarnion/gateway/internal/infrastructure/database"
	agentgrpc "github.com/newstarnion/gateway/internal/infrastructure/grpc"
	"github.com/newstarnion/gateway/internal/infrastructure/telegram"
	"go.uber.org/zap"
)

// fileDownloadClient is used for all external file downloads (MinIO, Telegram CDN).
// A 30-second timeout prevents goroutines from hanging on slow or stalled transfers.
var fileDownloadClient = &http.Client{Timeout: 30 * time.Second}

// maxFileDownloadBytes is the upper bound for in-memory file downloads (20 MiB).
// io.LimitReader enforces this to prevent unbounded memory consumption.
const maxFileDownloadBytes = 20 * 1024 * 1024

// albumEntry buffers photos from a Telegram media_group (album) until all messages arrive.
type albumEntry struct {
	mu             sync.Mutex
	photoFileIDs   []string
	documentFileID string
	text           string
	chatID         int64
	messageID      int
	telegramUserID int64
	firstName      string
	username       string
	chatType       string
	timer          *time.Timer
}

type TelegramHandler struct {
	db          *database.DB
	config      *config.Config
	agentClient *agentgrpc.AgentClient
	logger      *zap.Logger
	minio       *minio.Client
	albumBuf    sync.Map // key: media_group_id → *albumEntry
}

func NewTelegramHandler(db *database.DB, cfg *config.Config, agentClient *agentgrpc.AgentClient, logger *zap.Logger) *TelegramHandler {
	h := &TelegramHandler{db: db, config: cfg, agentClient: agentClient, logger: logger}
	if cfg.MinioAccessKey != "" {
		mc, err := minio.New(cfg.MinioEndpoint, &minio.Options{
			Creds:  credentials.NewStaticV4(cfg.MinioAccessKey, cfg.MinioSecretKey, ""),
			Secure: cfg.MinioUseSSL,
		})
		if err != nil {
			logger.Warn("TelegramHandler: failed to init MinIO client", zap.Error(err))
		} else {
			h.minio = mc
		}
	}
	return h
}

// TelegramUpdate represents an incoming Telegram webhook payload.
type TelegramUpdate struct {
	UpdateID int64 `json:"update_id"`
	Message  *struct {
		MessageID int64 `json:"message_id"`
		From      *struct {
			ID        int64  `json:"id"`
			Username  string `json:"username"`
			FirstName string `json:"first_name"`
			LastName  string `json:"last_name"`
		} `json:"from"`
		Chat *struct {
			ID   int64  `json:"id"`
			Type string `json:"type"`
		} `json:"chat"`
		Text         string `json:"text"`
		Caption      string `json:"caption"`
		MediaGroupID string `json:"media_group_id"`
		Photo        []struct {
			FileID string `json:"file_id"`
		} `json:"photo"`
		Voice *struct {
			FileID   string `json:"file_id"`
			Duration int    `json:"duration"`
		} `json:"voice"`
		Document *struct {
			FileID   string `json:"file_id"`
			FileName string `json:"file_name"`
			MimeType string `json:"mime_type"`
			FileSize int    `json:"file_size"`
		} `json:"document"`
	} `json:"message"`
}

// userBotInfo holds data about the user and their Telegram bot config.
type userBotInfo struct {
	userID    uuid.UUID
	botToken  string
	chatID    int64
	sessionID uuid.UUID
}

// findOrCreateUserByTelegram looks up the user by telegram_id column,
// or creates a new starnion user linked to the Telegram ID.
// telegramDisplayTitle returns a human-readable title for a Telegram conversation.
// Prefers real @username over numeric IDs, then firstName, then fallback.
func telegramDisplayTitle(firstName, username string, telegramUserID int64) string {
	// Skip username if it looks like a pure number (Telegram numeric ID stored as username).
	isNumericUsername := true
	for _, c := range username {
		if c < '0' || c > '9' {
			isNumericUsername = false
			break
		}
	}
	if username != "" && !isNumericUsername {
		return "@" + username
	}
	if firstName != "" {
		return firstName
	}
	if username != "" {
		return "@" + username
	}
	return fmt.Sprintf("Telegram %d", telegramUserID)
}

func (h *TelegramHandler) findOrCreateUserByTelegram(ctx context.Context, telegramUserID, chatID int64, firstName, username string) (*userBotInfo, error) {
	var userID uuid.UUID
	var botToken string

	// Try: existing user with matching telegram_id
	err := h.db.QueryRowContext(ctx,
		`SELECT id FROM users WHERE telegram_id = $1 LIMIT 1`,
		telegramUserID,
	).Scan(&userID)

	if err != nil {
		// No user — create one
		displayName := firstName
		if username != "" {
			displayName = username
		}
		if len(displayName) > 100 {
			displayName = displayName[:100]
		}
		safeUsername := username
		if len(safeUsername) > 100 {
			safeUsername = safeUsername[:100]
		}
		email := fmt.Sprintf("telegram_%d@starnion.local", telegramUserID)
		userID = uuid.New()
		err = h.db.QueryRowContext(ctx, `
			INSERT INTO users (id, email, display_name, password_hash, telegram_id, telegram_username)
			VALUES ($1, $2, $3, '', $4, $5)
			ON CONFLICT (email) DO UPDATE SET
				telegram_id = EXCLUDED.telegram_id,
				telegram_username = EXCLUDED.telegram_username
			RETURNING id
		`, userID, email, displayName, telegramUserID, safeUsername).Scan(&userID)
		if err != nil {
			return nil, fmt.Errorf("create telegram user: %w", err)
		}
	}

	// Resolve bot token from channel_settings
	var encBotToken string
	if csErr := h.db.QueryRowContext(ctx,
		`SELECT bot_token FROM channel_settings WHERE user_id = $1 AND channel = 'telegram' AND bot_token != '' LIMIT 1`,
		userID,
	).Scan(&encBotToken); csErr == nil && encBotToken != "" {
		decrypted, decErr := crypto.Decrypt(encBotToken, h.config.EncryptionKey)
		if decErr == nil && !strings.HasPrefix(decrypted, "enc:") && decrypted != "" {
			botToken = decrypted
		} else if !strings.HasPrefix(encBotToken, "enc:") {
			botToken = encBotToken // plaintext token stored before encryption was enabled
		}
		// else: encrypted token but decryption failed → botToken stays "" → falls through to config default
	}

	// Fall back to gateway-level default token
	if botToken == "" {
		botToken = h.config.TelegramBotToken
	}

	// botToken may be empty here — the caller (HandleUpdate) can supply the
	// poller's token as a fallback via the pollerBotToken variadic argument.

	// Get or create a conversation for this Telegram chat.
	// Use platform='telegram' + thread_id=chatID for deterministic lookup.
	// Multiple conversations per thread_id are allowed (/new creates new ones);
	// ORDER BY created_at DESC picks the most recently created conversation.
	var sessionID uuid.UUID
	channelKey := fmt.Sprintf("%d", chatID)
	err = h.db.QueryRowContext(ctx,
		`SELECT id FROM conversations
		 WHERE user_id = $1 AND platform = 'telegram' AND thread_id = $2
		 ORDER BY created_at DESC LIMIT 1`,
		userID, channelKey,
	).Scan(&sessionID)
	if err != nil {
		sessionID = uuid.New()
		convTitle := telegramDisplayTitle(firstName, username, telegramUserID)
		_, err = h.db.ExecContext(ctx,
			`INSERT INTO conversations (id, user_id, title, platform, thread_id)
			 VALUES ($1, $2, $3, 'telegram', $4)`,
			sessionID, userID, convTitle, channelKey,
		)
		if err != nil {
			return nil, fmt.Errorf("create telegram conversation: %w", err)
		}
	} else {
		// Update title in case username changed since last conversation.
		convTitle := telegramDisplayTitle(firstName, username, telegramUserID)
		if _, err := h.db.ExecContext(ctx,
			`UPDATE conversations SET title = $1 WHERE id = $2`,
			convTitle, sessionID,
		); err != nil {
			h.logger.Warn("failed to update telegram conversation title", zap.Error(err))
		}
	}

	return &userBotInfo{
		userID:    userID,
		botToken:  botToken,
		sessionID: sessionID,
	}, nil
}

// generateLinkCode creates a 6-char hex code, persists it in the ghost user's
// preferences JSONB (expires in 10 minutes), and returns the code.
func (h *TelegramHandler) generateLinkCode(ctx context.Context, userID uuid.UUID) (string, error) {
	b := make([]byte, 4)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	code := "NION-" + strings.ToUpper(hex.EncodeToString(b)) // e.g. "NION-A3F9C218"
	expiresAt := time.Now().Add(10 * time.Minute).UTC().Format(time.RFC3339)

	_, err := h.db.ExecContext(ctx, `
		UPDATE users
		SET preferences = jsonb_set(
			COALESCE(preferences, '{}')::jsonb,
			'{telegram_link}',
			$2::jsonb
		)
		WHERE id = $1`,
		userID,
		fmt.Sprintf(`{"code":"%s","expires_at":"%s"}`, code, expiresAt),
	)
	return code, err
}

// handleStartCommand handles the /start Telegram command.
// It generates a link code so the user can connect their web account.
func (h *TelegramHandler) handleStartCommand(ctx context.Context, info *userBotInfo, chatID int64) {
	tg := telegram.NewClient(info.botToken)

	code, err := h.generateLinkCode(ctx, info.userID)
	if err != nil {
		h.logger.Error("generateLinkCode failed", zap.Error(err))
		tg.SendMessage(chatID, "⚠️ Failed to generate link code. Please try again.")
		return
	}

	msg := fmt.Sprintf(
		"👋 Welcome to Starnion!\n\n"+
			"To connect this Telegram account with your web account, "+
			"go to Channels → Telegram in the web app and enter this code:\n\n"+
			"🔑 *%s*\n\n"+
			"_(valid for 10 minutes)_",
		code,
	)
	tg.SendMessage(chatID, msg)
}

// handleNewCommand resets the Telegram conversation so the next message starts fresh.
func (h *TelegramHandler) handleNewCommand(ctx context.Context, info *userBotInfo, tg *telegram.Client, chatID int64, firstName, username string) {
	newSessionID := uuid.New()
	channelKey := fmt.Sprintf("%d", chatID)
	convTitle := telegramDisplayTitle(firstName, username, chatID)
	_, err := h.db.ExecContext(ctx,
		`INSERT INTO conversations (id, user_id, title, platform, thread_id)
		 VALUES ($1, $2, $3, 'telegram', $4)`,
		newSessionID, info.userID, convTitle, channelKey,
	)
	if err != nil {
		tg.SendMessage(chatID, "⚠️ Failed to start a new conversation.")
		return
	}
	info.sessionID = newSessionID
	tg.SendMessage(chatID, "✅ New conversation started.")
}

// handleStatusCommand shows current persona and model.
func (h *TelegramHandler) handleStatusCommand(ctx context.Context, info *userBotInfo, tg *telegram.Client, chatID int64) {
	var personaName, model string
	h.db.QueryRowContext(ctx,
		`SELECT COALESCE(name,'Default'), COALESCE(model,'claude-sonnet-4-5')
		 FROM personas WHERE user_id = $1 AND is_default = TRUE LIMIT 1`,
		info.userID,
	).Scan(&personaName, &model)
	if personaName == "" {
		personaName = "Default"
	}
	if model == "" {
		model = "claude-sonnet-4-5"
	}
	msg := fmt.Sprintf("📊 Status\nPersona: %s\nModel: %s\nSession: active", personaName, model)
	tg.SendMessage(chatID, msg)
}

// handlePersonaCommand handles the /persona Telegram command.
// /persona        → list all personas, highlight the current default.
// /persona <N>    → switch to persona by list number.
// /persona <name> → switch to persona by name (case-insensitive).
func (h *TelegramHandler) handlePersonaCommand(ctx context.Context, info *userBotInfo, chatID int64, arg string) {
	tg := telegram.NewClient(info.botToken)

	type personaRow struct {
		id        string
		name      string
		isDefault bool
	}

	rows, err := h.db.QueryContext(ctx,
		`SELECT id, name, is_default FROM personas WHERE user_id = $1 ORDER BY is_default DESC, created_at ASC`,
		info.userID,
	)
	if err != nil {
		tg.SendMessage(chatID, "⚠️ Failed to fetch personas.")
		return
	}
	defer rows.Close()

	var personas []personaRow
	for rows.Next() {
		var p personaRow
		if err := rows.Scan(&p.id, &p.name, &p.isDefault); err != nil {
			continue
		}
		personas = append(personas, p)
	}
	if len(personas) == 0 {
		tg.SendMessage(chatID, "No personas found. Add one in Settings → Persona.")
		return
	}

	// No argument → show list.
	if arg == "" {
		var sb strings.Builder
		sb.WriteString("📋 *Persona List*\n\n")
		for i, p := range personas {
			if p.isDefault {
				sb.WriteString(fmt.Sprintf("*%d. %s* ✅ (current)\n", i+1, p.name))
			} else {
				sb.WriteString(fmt.Sprintf("%d. %s\n", i+1, p.name))
			}
		}
		sb.WriteString("\nSwitch: `/persona <number>` or `/persona <name>`")
		tg.SendMessage(chatID, sb.String())
		return
	}

	// Resolve target persona by number or name.
	var targetID string
	var targetName string

	// Try numeric index first.
	var n int
	if _, scanErr := fmt.Sscanf(arg, "%d", &n); scanErr == nil && n >= 1 && n <= len(personas) {
		targetID = personas[n-1].id
		targetName = personas[n-1].name
	} else {
		// Case-insensitive name match.
		argLower := strings.ToLower(arg)
		for _, p := range personas {
			if strings.ToLower(p.name) == argLower {
				targetID = p.id
				targetName = p.name
				break
			}
		}
		// Prefix match fallback.
		if targetID == "" {
			for _, p := range personas {
				if strings.HasPrefix(strings.ToLower(p.name), argLower) {
					targetID = p.id
					targetName = p.name
					break
				}
			}
		}
	}

	if targetID == "" {
		tg.SendMessage(chatID, fmt.Sprintf("❌ Persona \"%s\" not found.\nUse `/persona` to see the list.", arg))
		return
	}

	// Already active.
	for _, p := range personas {
		if p.id == targetID && p.isDefault {
			tg.SendMessage(chatID, fmt.Sprintf("✅ *%s* is already the active persona.", targetName))
			return
		}
	}

	// Atomic persona switch: set is_default = TRUE for the target row, FALSE for all
	// others in a single UPDATE to avoid a race between the two-step approach.
	_, err = h.db.ExecContext(ctx,
		`UPDATE personas SET is_default = (id = $1) WHERE user_id = $2`,
		targetID, info.userID,
	)
	if err != nil {
		tg.SendMessage(chatID, "⚠️ Failed to switch persona.")
		return
	}

	tg.SendMessage(chatID, fmt.Sprintf("✅ Switched to *%s*.", targetName))
}

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

// HandleUpdate processes a single Telegram update (used by both webhook and polling).
// chatType: "private", "group", "supergroup", etc.
// photoFileIDs: largest-resolution file IDs, one per unique photo.
// voiceFileID: file ID from Message.Voice.
// documentFileID: file ID from Message.Document (PDF, files, etc.).
func (h *TelegramHandler) HandleUpdate(
	ctx context.Context,
	telegramUserID, chatID int64,
	messageID int,
	firstName, username, text, chatType string,
	photoFileIDs []string,
	voiceFileID string,
	documentFileID string,
	pollerBotToken ...string,
) {
	info, err := h.findOrCreateUserByTelegram(ctx, telegramUserID, chatID, firstName, username)
	if err != nil && len(pollerBotToken) > 0 && pollerBotToken[0] != "" {
		// User lookup failed but we have the poller's token — try creating user with it
		info, err = h.findOrCreateUserByTelegram(ctx, telegramUserID, chatID, firstName, username)
	}
	if err != nil {
		h.logger.Error("findOrCreateUserByTelegram failed", zap.Error(err))
		return
	}
	info.chatID = chatID

	// Use the poller's bot token if the user doesn't have one configured
	if info.botToken == "" && len(pollerBotToken) > 0 {
		info.botToken = pollerBotToken[0]
	}

	tg := telegram.NewClient(info.botToken)

	// ── Feature 1 & 4: Policy + bot_username — single query ──────────────────
	var dmPolicy, groupPolicy, botUsername string
	h.db.QueryRowContext(ctx,
		`SELECT COALESCE(dm_policy,'allow'), COALESCE(group_policy,'allow'), COALESCE(bot_username,'')
		 FROM channel_settings WHERE user_id = $1 AND channel = 'telegram'`,
		info.userID,
	).Scan(&dmPolicy, &groupPolicy, &botUsername)

	activePolicy := dmPolicy
	if chatType == "group" || chatType == "supergroup" {
		activePolicy = groupPolicy
	}

	if activePolicy == "deny" {
		tg.SendMessage(chatID, "❌ Access denied.")
		return
	}

	if activePolicy == "pairing" {
		var pairingStatus string
		h.db.QueryRowContext(ctx,
			`SELECT status FROM telegram_pairing_requests
			 WHERE owner_user_id = $1 AND telegram_id = $2 LIMIT 1`,
			info.userID, fmt.Sprintf("%d", telegramUserID),
		).Scan(&pairingStatus)

		if pairingStatus != "approved" {
			displayName := firstName
			if username != "" {
				displayName = username
			}
			h.db.ExecContext(ctx,
				`INSERT INTO telegram_pairing_requests (owner_user_id, telegram_id, display_name, status)
				 VALUES ($1, $2, $3, 'pending')
				 ON CONFLICT (owner_user_id, telegram_id) DO UPDATE
				   SET display_name = EXCLUDED.display_name, status = 'pending'`,
				info.userID, fmt.Sprintf("%d", telegramUserID), displayName,
			)
			tg.SendMessage(chatID, "⏳ Pairing request sent. Wait for approval.")
			return
		}
	}

	// ── Feature 4: Group @mention filtering ───────────────────────────────────
	if chatType == "group" || chatType == "supergroup" {
		if botUsername != "" {
			mention := "@" + botUsername
			isCommand := strings.HasPrefix(text, "/")
			hasMention := strings.Contains(strings.ToLower(text), strings.ToLower(mention))
			if !isCommand && !hasMention {
				// Not addressed to this bot — ignore silently
				return
			}
			// Strip the @mention from text
			text = strings.TrimSpace(strings.ReplaceAll(text, mention, ""))
			text = strings.TrimSpace(strings.ReplaceAll(text, strings.ToLower(mention), ""))
		}
	}

	// ── Feature 5: Bot Commands (dispatched via CommandRegistry) ─────────────
	if DispatchCommand(ctx, h, info, tg, chatID, firstName, username, text) {
		return
	}

	// ── Feature 6: Voice message ───────────────────────────────────────────────
	if voiceFileID != "" {
		if h.minio != nil {
			data, ct, _, dlErr := h.downloadTelegramFile(tg, voiceFileID)
			if dlErr != nil {
				h.logger.Warn("failed to download telegram voice", zap.String("file_id", voiceFileID), zap.Error(dlErr))
			} else {
				if !strings.HasPrefix(ct, "audio/") {
					ct = "audio/ogg"
				}
				minioURL, upErr := h.uploadToMinio(ctx, data, ct, info.userID.String())
				if upErr != nil {
					h.logger.Warn("failed to upload telegram voice to minio", zap.Error(upErr))
				} else {
					voiceMarker := fmt.Sprintf("[audio:%s] 이 음성 메시지를 텍스트로 변환해주세요.", minioURL)
					if text == "" {
						text = voiceMarker
					} else {
						text = voiceMarker + " " + text
					}
				}
			}
		} else {
			tg.SendMessage(chatID, "🎙️ 음성 메시지를 처리하려면 MinIO 파일 스토리지가 필요합니다.")
			return
		}
	}

	// ── Feature 6: Image + Document message handling ──────────────────────────
	var agentImages []agentgrpc.ImageContent
	if len(photoFileIDs) > 0 {
		var imageURLs []string
		for _, fileID := range photoFileIDs {
			data, ct, _, dlErr := h.downloadTelegramFile(tg, fileID)
			if dlErr != nil {
				h.logger.Warn("failed to download telegram photo", zap.String("file_id", fileID), zap.Error(dlErr))
				continue
			}
			// Always collect image bytes for vision (cap at 4MB per image to avoid gRPC size limits).
			// This works even when MinIO is not configured.
			if len(data) <= 4*1024*1024 {
				agentImages = append(agentImages, agentgrpc.ImageContent{
					Data:     base64.StdEncoding.EncodeToString(data),
					MimeType: ct,
				})
			}
			// Upload to MinIO for persistent URL if configured
			if h.minio != nil {
				minioURL, upErr := h.uploadToMinio(ctx, data, ct, info.userID.String())
				if upErr != nil {
					h.logger.Warn("failed to upload telegram photo to minio", zap.Error(upErr))
				} else {
					imageURLs = append(imageURLs, minioURL)
					// Insert into files table with EXIF metadata
					meta := extractImageMetadata(data)
					metaJSON, _ := json.Marshal(meta)
					if len(meta) == 0 {
						metaJSON = []byte("{}")
					}
					objKey := strings.TrimPrefix(minioURL, "/api/files/")
					filename := path.Base(objKey)
					h.db.ExecContext(ctx, //nolint:errcheck
						`INSERT INTO files (user_id, name, mime, file_type, url, object_key, size, source, sub_type, metadata)
						 VALUES ($1, $2, $3, 'image', $4, $5, $6, 'telegram', 'uploaded', $7)`,
						info.userID, filename, ct, minioURL, objKey, int64(len(data)), metaJSON,
					)
				}
			}
		}
		if len(imageURLs) > 0 {
			var imgText strings.Builder
			for _, u := range imageURLs {
				imgText.WriteString("[image:")
				imgText.WriteString(u)
				imgText.WriteString("] ")
			}
			markers := strings.TrimSpace(imgText.String())
			if text == "" {
				text = markers
			} else {
				text = markers + " " + text
			}
		} else if len(agentImages) == 0 {
			// Fallback: no image data collected at all
			if text == "" {
				text = "[photo]"
			} else {
				text = "[photo] " + text
			}
		}
	}

	if documentFileID != "" {
		if h.minio != nil {
			data, ct, filename, dlErr := h.downloadTelegramFile(tg, documentFileID)
			if dlErr != nil {
				h.logger.Warn("failed to download telegram document", zap.String("file_id", documentFileID), zap.Error(dlErr))
			} else {
				minioURL, upErr := h.uploadToMinio(ctx, data, ct, info.userID.String())
				if upErr != nil {
					h.logger.Warn("failed to upload telegram document to minio", zap.Error(upErr))
				} else {
					docMarker := fmt.Sprintf("[file:%s name=%s]", minioURL, filename)
					if text == "" {
						text = docMarker
					} else {
						text = docMarker + " " + text
					}
					// Insert into files table with metadata (EXIF for images, empty for others)
					var docMeta map[string]any
					if strings.HasPrefix(strings.ToLower(ct), "image/") {
						docMeta = extractImageMetadata(data)
					}
					docMetaJSON, _ := json.Marshal(docMeta)
					if docMeta == nil || len(docMeta) == 0 {
						docMetaJSON = []byte("{}")
					}
					objKey := strings.TrimPrefix(minioURL, "/api/files/")
					ft := detectFileType(ct, filename)
					h.db.ExecContext(ctx, //nolint:errcheck
						`INSERT INTO files (user_id, name, mime, file_type, url, object_key, size, source, sub_type, metadata)
						 VALUES ($1, $2, $3, $4, $5, $6, $7, 'telegram', 'uploaded', $8)`,
						info.userID, filename, ct, ft, minioURL, objKey, int64(len(data)), docMetaJSON,
					)
				}
			}
		}
	}

	// At this point we need text to proceed
	if strings.TrimSpace(text) == "" {
		return
	}

	// 👀 fire-and-forget reaction — never blocks the hot path
	go tg.SetReaction(chatID, messageID, "👀")

	// start typing indicator loop concurrently
	typingCtx, typingCancel := context.WithCancel(ctx)
	go h.typingLoop(typingCtx, tg, chatID)
	defer typingCancel()

	if h.agentClient == nil {
		typingCancel()
		go tg.SetReaction(chatID, messageID, "😢")
		tg.SendMessage(chatID, "⚠️ Agent service is currently unavailable.")
		return
	}

	// Resolve persona (conversation-specific → user default) with bot/user name injection.
	pInfo := resolvePersona(ctx, h.db, info.sessionID, info.userID, h.config.EncryptionKey)
	tgProvider, tgModel, tgSystemPrompt, tgAPIKey := pInfo.provider, pInfo.model, pInfo.systemPrompt, pInfo.apiKey
	tgBotName := pInfo.botName
	// Fall back to agent default so model_used is never empty.
	if tgModel == "" {
		tgModel = "claude-sonnet-4-5"
	}

	// [Persona Debug] Log persona injection state for Telegram
	tgSystemPromptPreview := tgSystemPrompt
	if len(tgSystemPromptPreview) > 80 {
		tgSystemPromptPreview = tgSystemPromptPreview[:80] + "..."
	}
	h.logger.Info("[Persona] telegram injection",
		zap.String("user_id", info.userID.String()),
		zap.String("persona_model", tgModel),
		zap.String("persona_provider", tgProvider),
		zap.Bool("system_prompt_set", tgSystemPrompt != ""),
		zap.String("system_prompt_preview", tgSystemPromptPreview),
	)

	// Persist user message to conversations/messages table.
	if len(text) > 32000 {
		text = text[:32000]
	}
	h.db.ExecContext(ctx,
		`INSERT INTO messages (id, conversation_id, role, content) VALUES ($1, $2, 'user', $3)`,
		uuid.New(), info.sessionID, text,
	)

	// Fetch recent messages for context reconstruction (JSONL fallback).
	tgRecentMsgs := fetchRecentMessagesFromConv(ctx, h.db, info.sessionID.String(), 20)

	// ── Feature 7: Streaming Response ─────────────────────────────────────────
	// Launch ⏳ placeholder send and gRPC StreamChat concurrently to hide round-trip latency.
	var (
		msgID   int64
		sendErr error
		events  <-chan agentgrpc.ChatEvent
		grpcErr error
	)
	var initWg sync.WaitGroup
	initWg.Add(2)
	go func() {
		defer initWg.Done()
		msgID, sendErr = tg.SendMessageGetID(chatID, "⏳", "")
	}()
	go func() {
		defer initWg.Done()
		tgTimezone, _ := cachedUserPrefs(ctx, h.db, info.userID)
		var tgConfiguredProviders []string
		if rows, qErr := h.db.QueryContext(ctx,
			`SELECT provider FROM integration_keys WHERE user_id = $1`,
			info.userID,
		); qErr == nil {
			for rows.Next() {
				var p string
				if rows.Scan(&p) == nil {
					tgConfiguredProviders = append(tgConfiguredProviders, p)
				}
			}
			rows.Close()
		}
		tgSecondaryModel := resolveAssignedModel(ctx, h.db, info.userID, "secondary")
		tgFallbackChain := resolveFallbackChain(ctx, h.db, info.userID, h.config.EncryptionKey, tgProvider)
		tgSkillEnvJSON := resolveSkillEnvJSON(ctx, h.db, info.userID, h.config.EncryptionKey)
		tgDisabledSkillsJSON := resolveDisabledSkillsJSON(ctx, h.db, info.userID)
		events, grpcErr = h.agentClient.StreamChat(ctx, info.userID.String(), info.sessionID.String(), text, tgModel, tgProvider, tgAPIKey, tgSystemPrompt, tgTimezone, tgSecondaryModel, tgRecentMsgs, agentImages, nil, tgConfiguredProviders, "telegram", tgFallbackChain, tgSkillEnvJSON, tgDisabledSkillsJSON)
	}()
	initWg.Wait()
	typingCancel() // editing replaces the typing indicator

	if grpcErr != nil {
		h.logger.Error("StreamChat error", zap.Error(grpcErr))
		go tg.SetReaction(chatID, messageID, "😢")
		tg.SendMessage(chatID, "⚠️ Failed to process your message. Please try again.")
		return
	}

	var buf strings.Builder
	var bufMu sync.Mutex
	var tgInputTokens, tgOutputTokens, tgContextTokens, tgContextWindow, tgCacheReadTokens int
	var streamErrorMsg string // captured from the last "error" event

	// Drain stream in a goroutine; signal done when finished.
	streamDone := make(chan struct{})
	go func() {
		defer close(streamDone)
		for ev := range events {
			switch ev.Type {
			case "text":
				bufMu.Lock()
				buf.WriteString(ev.Text)
				bufMu.Unlock()
			case "done":
				tgInputTokens = ev.InputTokens
				tgOutputTokens = ev.OutputTokens
				tgCacheReadTokens = ev.CacheReadTokens
				tgContextTokens = ev.ContextTokens
				tgContextWindow = ev.ContextWindow
			case "error":
				h.logger.Warn("agent stream error", zap.String("msg", ev.ErrorMsg))
				streamErrorMsg = ev.ErrorMsg
			}
		}
	}()

	// Periodic edit loop — update the placeholder every 800ms while streaming.
	// Skip the edit if the accumulated text hasn't changed since the last send
	// to avoid unnecessary Telegram API calls (and potential rate limiting).
	editTicker := time.NewTicker(800 * time.Millisecond)
	defer editTicker.Stop()
	var lastSent string

loop:
	for {
		select {
		case <-editTicker.C:
			if sendErr != nil {
				continue
			}
			bufMu.Lock()
			current := buf.String()
			bufMu.Unlock()
			if current != "" && current != lastSent {
				tg.EditMessage(chatID, msgID, telegram.MarkdownToHTML(current+" ▌"), "HTML")
				lastSent = current
			}
		case <-streamDone:
			break loop
		}
	}

	bufMu.Lock()
	fullReply := strings.TrimSpace(buf.String())
	bufMu.Unlock()

	// If no reply was generated and there was an error, show a friendly message.
	if fullReply == "" && streamErrorMsg != "" {
		outMsg := streamErrorMsg
		if cat := classifyAgentError(streamErrorMsg); cat != errCatUnknown {
			_, lang := cachedUserPrefs(ctx, h.db, info.userID)
			if friendly := friendlyErrorMessage(cat, lang); friendly != "" {
				outMsg = friendly
			}
		}
		tg.EditMessage(chatID, msgID, telegram.MarkdownToHTML(outMsg), "HTML")
		go tg.SetReaction(chatID, messageID, "😢")
		return
	}

	// Persist assistant message and update conversation timestamp.
	if fullReply != "" {
		h.db.ExecContext(ctx,
			`INSERT INTO messages (id, conversation_id, role, content, bot_name, model_used, input_tokens, output_tokens, context_tokens, context_window)
			 VALUES ($1, $2, 'assistant', $3, $4, $5, $6, $7, $8, $9)`,
			uuid.New(), info.sessionID, fullReply, tgBotName, tgModel, tgInputTokens, tgOutputTokens, tgContextTokens, tgContextWindow,
		)
		insertUsageLog(ctx, h.db, info.userID, tgModel, tgProvider, tgInputTokens, tgCacheReadTokens, tgOutputTokens, "chat", 0)
	}
	h.db.ExecContext(ctx,
		`UPDATE conversations SET updated_at = NOW() WHERE id = $1`,
		info.sessionID,
	)

	// ── Image handling: extract, download, send as photos ─────────────────────
	images := extractImages(fullReply)
	h.logger.Info("extractImages debug",
		zap.Int("image_count", len(images)),
		zap.String("reply_preview", func() string {
			if len(fullReply) > 300 {
				return fullReply[:300]
			}
			return fullReply
		}()),
	)
	// ── Document handling: extract document download links ─────────────────────
	docs := extractDocLinks(fullReply)
	// ── Audio handling: extract audio file links ─────────────────────────────
	audios := extractAudio(fullReply)
	textReply := fullReply
	if len(images) > 0 {
		textReply = removeImageMarkdown(textReply)
	}
	if len(docs) > 0 {
		textReply = removeDocLinks(textReply)
	}
	if len(audios) > 0 {
		textReply = removeAudioMarkdown(textReply)
	}

	if textReply == "" && len(images) == 0 && len(docs) == 0 && len(audios) == 0 {
		textReply = "✅ Done"
	}

	// Send placeholder edit (text part)
	if sendErr == nil {
		displayText := textReply
		if displayText == "" {
			displayText = "✅ Done"
		}
		if err := tg.EditMessage(chatID, msgID, telegram.MarkdownToHTML(displayText), "HTML"); err != nil {
			h.logger.Debug("EditMessage final (ignored)", zap.Error(err))
		}
	} else {
		// Fallback: send in chunks as plain text.
		const maxLen = 4000
		sendFailed := false
		for len(textReply) > 0 {
			chunk := textReply
			if len(chunk) > maxLen {
				chunk = chunk[:maxLen]
			}
			if err := tg.SendMessage(chatID, chunk); err != nil {
				h.logger.Error("SendMessage fallback error", zap.Error(err))
				sendFailed = true
				break
			}
			textReply = textReply[len(chunk):]
		}
		if sendFailed {
			tg.SetReaction(chatID, messageID, "😢")
			return
		}
	}

	// Send each generated document as a Telegram file attachment.
	for _, doc := range docs {
		data, filename, dlErr := downloadFromMinio(h.config, doc.path)
		if dlErr != nil {
			h.logger.Warn("failed to download doc from MinIO", zap.String("path", doc.path), zap.Error(dlErr))
			// Fallback: send download link as text
			tg.SendMessage(chatID, doc.path)
			continue
		}
		// Use the name from the link text (strip emoji prefix if present)
		displayName := strings.TrimPrefix(strings.TrimPrefix(doc.name, "📄 "), "📄")
		displayName = strings.TrimSpace(displayName)
		if displayName == "" {
			displayName = filename
		}
		if err := tg.SendDocument(chatID, data, displayName, ""); err != nil {
			h.logger.Warn("sendDocument failed", zap.String("filename", displayName), zap.Error(err))
			tg.SendMessage(chatID, doc.path)
		}
	}

	// Send each generated image as a Telegram photo.
	photoSent := false
	for _, img := range images {
		data, filename, dlErr := downloadFromMinio(h.config, img.path)
		if dlErr != nil {
			h.logger.Warn("failed to download image from MinIO", zap.String("path", img.path), zap.Error(dlErr))
			continue
		}
		caption := img.alt
		if caption == "generated image" || caption == "" {
			caption = ""
		}
		if err := tg.SendPhoto(chatID, data, filename, caption); err != nil {
			h.logger.Error("sendPhoto failed",
				zap.String("filename", filename),
				zap.Int("bytes", len(data)),
				zap.String("path", img.path),
				zap.Error(err),
			)
			// Fallback: send URL as text
			tg.SendMessage(chatID, img.path)
		} else {
			photoSent = true
			// Save to images table so it appears in the image gallery.
			mimeType := "image/png"
			if strings.HasSuffix(strings.ToLower(filename), ".jpg") || strings.HasSuffix(strings.ToLower(filename), ".jpeg") {
				mimeType = "image/jpeg"
			}
			imgName := img.alt
			if imgName == "" || imgName == "generated image" {
				imgName = filename
			}
			h.db.ExecContext(ctx,
				`INSERT INTO images (user_id, url, name, mime, size, source, type)
				 VALUES ($1, $2, $3, $4, $5, 'browser', 'screenshot')`,
				info.userID, img.path, imgName, mimeType, int64(len(data)),
			)
		}
	}

	// Send each generated audio as a Telegram audio message.
	for _, aud := range audios {
		data, filename, dlErr := downloadFromMinio(h.config, aud.path)
		if dlErr != nil {
			h.logger.Warn("failed to download audio from MinIO", zap.String("path", aud.path), zap.Error(dlErr))
			tg.SendMessage(chatID, aud.path)
			continue
		}
		caption := aud.name
		if caption == "" {
			caption = filename
		}
		if err := tg.SendAudio(chatID, data, filename, caption); err != nil {
			h.logger.Error("sendAudio failed", zap.String("filename", filename), zap.Error(err))
			tg.SendMessage(chatID, aud.path)
		}
	}

	if photoSent || textReply != "" || len(docs) > 0 || len(audios) > 0 {
		tg.SetReaction(chatID, messageID, "👍")
	} else if len(images) > 0 {
		tg.SetReaction(chatID, messageID, "😢")
	} else {
		tg.SetReaction(chatID, messageID, "👍")
	}
}

func (h *TelegramHandler) Webhook(c echo.Context) error {
	var update TelegramUpdate
	if err := c.Bind(&update); err != nil {
		h.logger.Error("Failed to parse telegram update", zap.Error(err))
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid update"})
	}

	if update.Message == nil || update.Message.From == nil || update.Message.Chat == nil {
		return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
	}

	msg := update.Message
	telegramUserID := msg.From.ID
	chatID := msg.Chat.ID
	messageID := int(msg.MessageID)
	chatType := msg.Chat.Type
	text := strings.TrimSpace(msg.Text)
	caption := strings.TrimSpace(msg.Caption)

	// Collect the largest photo file ID (Telegram returns sizes small→large).
	var photoFileIDs []string
	if len(msg.Photo) > 0 {
		if largest := msg.Photo[len(msg.Photo)-1]; largest.FileID != "" {
			photoFileIDs = []string{largest.FileID}
		}
	}

	// Voice file ID
	voiceFileID := ""
	if msg.Voice != nil {
		voiceFileID = msg.Voice.FileID
	}

	// Document file ID
	documentFileID := ""
	if msg.Document != nil && msg.Document.FileID != "" {
		documentFileID = msg.Document.FileID
	}

	// Use caption when there is no text but there is a photo/doc with caption.
	if text == "" && caption != "" {
		text = caption
	}

	h.logger.Info("Telegram webhook message received",
		zap.Int64("telegram_user_id", telegramUserID),
		zap.String("text", text),
		zap.String("chat_type", chatType),
		zap.String("media_group_id", msg.MediaGroupID),
	)

	// Skip if truly empty
	if text == "" && len(photoFileIDs) == 0 && voiceFileID == "" && documentFileID == "" {
		return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
	}

	// Album buffering: collect all photos from a media_group before processing.
	if msg.MediaGroupID != "" {
		newEntry := &albumEntry{
			chatID:         chatID,
			messageID:      messageID,
			telegramUserID: telegramUserID,
			firstName:      msg.From.FirstName,
			username:       msg.From.Username,
			chatType:       chatType,
		}
		actual, _ := h.albumBuf.LoadOrStore(msg.MediaGroupID, newEntry)
		entry := actual.(*albumEntry)

		entry.mu.Lock()
		entry.photoFileIDs = append(entry.photoFileIDs, photoFileIDs...)
		if text != "" && entry.text == "" {
			entry.text = text
		}
		if documentFileID != "" && entry.documentFileID == "" {
			entry.documentFileID = documentFileID
		}
		if entry.timer != nil {
			entry.timer.Stop()
		}
		capturedGroupID := msg.MediaGroupID
		entry.timer = time.AfterFunc(1500*time.Millisecond, func() {
			h.albumBuf.Delete(capturedGroupID)
			entry.mu.Lock()
			pFileIDs := append([]string(nil), entry.photoFileIDs...)
			dFileID := entry.documentFileID
			txt := entry.text
			cID := entry.chatID
			mID := entry.messageID
			tUID := entry.telegramUserID
			fn := entry.firstName
			un := entry.username
			ct := entry.chatType
			entry.mu.Unlock()
			go h.HandleUpdate(context.Background(), tUID, cID, mID, fn, un, txt, ct, pFileIDs, "", dFileID)
		})
		entry.mu.Unlock()

		return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
	}

	// Use a detached context so the goroutine is NOT cancelled when the
	// webhook HTTP handler returns 200 to Telegram.
	go h.HandleUpdate(
		context.Background(),
		telegramUserID, chatID, messageID,
		msg.From.FirstName, msg.From.Username,
		text, chatType,
		photoFileIDs, voiceFileID, documentFileID,
	)

	return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
}

type TelegramConfigRequest struct {
	BotToken   string  `json:"bot_token" validate:"required"`
	WebhookURL *string `json:"webhook_url"`
}

func (h *TelegramHandler) GetConfig(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	var cfg struct {
		BotToken    string  `json:"bot_token"`
		BotUsername *string `json:"bot_username"`
		IsActive    bool    `json:"is_active"`
	}

	err = h.db.QueryRowContext(c.Request().Context(),
		`SELECT bot_token, bot_username, enabled FROM channel_settings WHERE user_id = $1 AND channel = 'telegram'`,
		userID,
	).Scan(&cfg.BotToken, &cfg.BotUsername, &cfg.IsActive)
	if err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "no telegram config found"})
	}

	// Decrypt before masking
	plainToken, _ := crypto.Decrypt(cfg.BotToken, h.config.EncryptionKey)
	if plainToken != "" {
		cfg.BotToken = plainToken
	}
	// Mask token for security
	if len(cfg.BotToken) > 10 {
		cfg.BotToken = cfg.BotToken[:10] + "..."
	}

	return c.JSON(http.StatusOK, cfg)
}

func (h *TelegramHandler) UpdateConfig(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	var req TelegramConfigRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}

	encToken, err := crypto.Encrypt(req.BotToken, h.config.EncryptionKey)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to save config"})
	}

	_, err = h.db.ExecContext(c.Request().Context(),
		`INSERT INTO channel_settings (user_id, channel, bot_token, enabled)
		 VALUES ($1, 'telegram', $2, true)
		 ON CONFLICT (user_id, channel) DO UPDATE SET
		   bot_token  = EXCLUDED.bot_token,
		   updated_at = NOW()`,
		userID, encToken,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to update config"})
	}

	return c.JSON(http.StatusOK, map[string]string{"status": "updated"})
}

func (h *TelegramHandler) DeleteConfig(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	_, err = h.db.ExecContext(c.Request().Context(),
		`UPDATE channel_settings SET bot_token = '', enabled = false WHERE user_id = $1 AND channel = 'telegram'`,
		userID,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to delete config"})
	}

	return c.JSON(http.StatusOK, map[string]string{"status": "deleted"})
}

type TelegramLinkRequest struct {
	TelegramUserID int64 `json:"telegram_user_id"`
}

// LinkTelegram links the given telegram_user_id to the authenticated web account.
// If a ghost telegram-only account exists for that ID, its data is migrated.
func (h *TelegramHandler) LinkTelegram(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	var req TelegramLinkRequest
	if err := c.Bind(&req); err != nil || req.TelegramUserID == 0 {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "telegram_user_id is required"})
	}

	ctx := c.Request().Context()

	// Check: is this telegram_id already linked to another account?
	var existingID string
	err = h.db.QueryRowContext(ctx,
		`SELECT id FROM users WHERE telegram_id = $1 AND id != $2 LIMIT 1`,
		req.TelegramUserID, userID,
	).Scan(&existingID)

	if err == nil {
		// A different user already owns this telegram_id — migrate their data
		ghostID := existingID

		// Migrate finance_records
		h.db.ExecContext(ctx, `UPDATE finance_records SET user_id = $1 WHERE user_id = $2`, userID, ghostID)
		// Migrate diary_entries
		h.db.ExecContext(ctx, `UPDATE diary_entries SET user_id = $1 WHERE user_id = $2`, userID, ghostID)
		// Migrate goals
		h.db.ExecContext(ctx, `UPDATE goals SET user_id = $1 WHERE user_id = $2`, userID, ghostID)
		// Migrate chat_sessions (and cascade to chat_messages via FK)
		h.db.ExecContext(ctx, `UPDATE chat_sessions SET user_id = $1 WHERE user_id = $2`, userID, ghostID)
		// Migrate conversations (and cascade to messages via FK)
		h.db.ExecContext(ctx, `UPDATE conversations SET user_id = $1 WHERE user_id = $2`, userID, ghostID)
		// Delete ghost user
		h.db.ExecContext(ctx, `DELETE FROM users WHERE id = $1`, ghostID)

		h.logger.Info("Migrated ghost telegram user to web account",
			zap.String("ghost_id", ghostID),
			zap.String("target_id", userID.String()),
		)
	}

	// Link telegram_id to the current web account
	_, err = h.db.ExecContext(ctx,
		`UPDATE users SET telegram_id = $1, telegram_username = $2 WHERE id = $3`,
		req.TelegramUserID, fmt.Sprintf("%d", req.TelegramUserID), userID,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to link telegram account"})
	}

	return c.JSON(http.StatusOK, map[string]any{
		"status":           "linked",
		"telegram_user_id": req.TelegramUserID,
	})
}

// LinkTelegramByCode links a web account to a Telegram account using the
// short-lived code generated by the /start bot command.
// POST /api/v1/telegram/link-code {"code": "A3F9C2"}
func (h *TelegramHandler) LinkTelegramByCode(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	var req struct {
		Code string `json:"code"`
	}
	if err := c.Bind(&req); err != nil || req.Code == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "code is required"})
	}
	req.Code = strings.ToUpper(strings.TrimSpace(req.Code))
	// Accept with or without prefix: "A3F9C2" → "NION-A3F9C2"
	if !strings.HasPrefix(req.Code, "NION-") {
		req.Code = "NION-" + req.Code
	}

	ctx := c.Request().Context()

	// Find the ghost user that holds this code (not yet expired).
	var ghostID uuid.UUID
	var telegramID int64
	err = h.db.QueryRowContext(ctx, `
		SELECT u.id, u.telegram_id
		FROM users u
		WHERE u.preferences->'telegram_link'->>'code' = $1
		  AND (u.preferences->'telegram_link'->>'expires_at')::timestamptz > NOW()
		  AND u.telegram_id IS NOT NULL
		LIMIT 1
	`, req.Code).Scan(&ghostID, &telegramID)
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid or expired code"})
	}

	// If the ghost IS the current user (already a web account), just clear the code.
	if ghostID == userID {
		h.db.ExecContext(ctx, `
			UPDATE users SET preferences = preferences - 'telegram_link' WHERE id = $1`, userID)
		return c.JSON(http.StatusOK, map[string]any{"status": "already_linked", "telegram_id": telegramID})
	}

	// Migrate ghost user's data to the current web account.
	for _, tbl := range []string{"finance_records", "diary_entries", "goals", "chat_sessions", "conversations", "memos", "dday_events"} {
		h.db.ExecContext(ctx, fmt.Sprintf(`UPDATE %s SET user_id = $1 WHERE user_id = $2`, tbl), userID, ghostID)
	}
	h.db.ExecContext(ctx, `DELETE FROM users WHERE id = $1`, ghostID)

	// Set telegram_id on the web account and clear the link code.
	_, err = h.db.ExecContext(ctx, `
		UPDATE users
		SET telegram_id = $1,
		    telegram_username = $2,
		    preferences = preferences - 'telegram_link'
		WHERE id = $3`,
		telegramID, fmt.Sprintf("%d", telegramID), userID,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to link account"})
	}

	h.logger.Info("Telegram account linked via code",
		zap.String("user_id", userID.String()),
		zap.Int64("telegram_id", telegramID),
	)

	return c.JSON(http.StatusOK, map[string]any{
		"status":      "linked",
		"telegram_id": telegramID,
	})
}
