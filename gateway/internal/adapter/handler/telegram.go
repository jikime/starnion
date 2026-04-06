package handler

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"path"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"github.com/newstarnion/gateway/config"
	agentgrpc "github.com/newstarnion/gateway/internal/infrastructure/grpc"
	"github.com/newstarnion/gateway/internal/infrastructure/database"
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
			go h.HandleUpdate(context.Background(), tUID, cID, mID, fn, un, txt, ct, pFileIDs, "", dFileID) // TODO: use server shutdown context for graceful shutdown
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
