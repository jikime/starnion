package telegram

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	starnionv1 "github.com/jikime/starnion/gateway/gen/starnion/v1"
	"github.com/jikime/starnion/gateway/internal/activity"
	"github.com/jikime/starnion/gateway/internal/identity"
	"github.com/jikime/starnion/gateway/internal/skill"
	"github.com/jikime/starnion/gateway/internal/storage"
	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"
	"github.com/rs/zerolog/log"
	"google.golang.org/grpc"
)

// policyCache caches per-user DM/Group policy to avoid a DB hit on every message.
type policyCache struct {
	mu          sync.RWMutex
	dmPolicy    string
	groupPolicy string
	cachedAt    time.Time
}

const policyCacheTTL = 30 * time.Second

// Bot wraps the Telegram bot API and forwards messages to the agent via gRPC.
type Bot struct {
	api          *tgbotapi.BotAPI
	grpcClient   starnionv1.AgentServiceClient
	tracker      *activity.Tracker
	db           *sql.DB
	store        *storage.MinIO
	skillService *skill.Service
	identitySvc  *identity.Service

	// ownerUserID is the web user who owns this bot instance.
	ownerUserID string
	// policy is an in-memory cache for DM/Group policy values.
	policy policyCache
}

// NewBot creates a new Telegram bot connected to the agent gRPC service.
// ownerUserID is the web platform user ID (UUID) that owns this bot token.
func NewBot(token, ownerUserID string, grpcConn *grpc.ClientConn, tracker *activity.Tracker, db *sql.DB, store *storage.MinIO, skillSvc *skill.Service, identitySvc *identity.Service) (*Bot, error) {
	api, err := tgbotapi.NewBotAPI(token)
	if err != nil {
		return nil, fmt.Errorf("telegram bot init: %w", err)
	}

	log.Info().Str("username", api.Self.UserName).Str("owner", ownerUserID).Msg("Telegram bot authorised")

	return &Bot{
		api:          api,
		grpcClient:   starnionv1.NewAgentServiceClient(grpcConn),
		tracker:      tracker,
		db:           db,
		store:        store,
		skillService: skillSvc,
		identitySvc:  identitySvc,
		ownerUserID:  ownerUserID,
	}, nil
}

// loadPolicy returns the current DM/Group policy for this bot's owner.
// Results are cached for policyCacheTTL to reduce DB load.
func (b *Bot) loadPolicy() (dmPolicy, groupPolicy string) {
	b.policy.mu.RLock()
	if time.Since(b.policy.cachedAt) < policyCacheTTL {
		dm, grp := b.policy.dmPolicy, b.policy.groupPolicy
		b.policy.mu.RUnlock()
		if dm != "" {
			return dm, grp
		}
	}
	b.policy.mu.RUnlock()

	// Refresh from DB.
	dm, grp := "allow", "allow"
	if b.db != nil && b.ownerUserID != "" {
		row := b.db.QueryRowContext(context.Background(), `
			SELECT dm_policy, group_policy
			FROM channel_settings
			WHERE user_id = $1 AND channel = 'telegram'
		`, b.ownerUserID)
		var d, g string
		if err := row.Scan(&d, &g); err == nil {
			dm, grp = d, g
		}
	}

	b.policy.mu.Lock()
	b.policy.dmPolicy = dm
	b.policy.groupPolicy = grp
	b.policy.cachedAt = time.Now()
	b.policy.mu.Unlock()

	return dm, grp
}

// Run starts polling for Telegram updates and processing them.
// It blocks until ctx is cancelled, then returns promptly (within one poll cycle).
//
// We intentionally avoid tgbotapi.GetUpdatesChan because its internal goroutine
// uses a hardcoded time.Sleep(3s) on errors that cannot be interrupted by context
// cancellation.  In the worst case (poll timeout + sleep) that goroutine takes 8s
// to exit, exceeding StopBot's 7s wait and leaving a zombie goroutine that races
// with the next bot instance → Telegram 409 Conflict.
//
// Instead we drive the polling loop ourselves so that every wait point is
// a context-aware select, guaranteeing Run() exits within one poll cycle
// (≤ pollTimeout seconds) after ctx is cancelled.
func (b *Bot) Run(ctx context.Context) {
	const pollTimeout = 5 // seconds — Telegram long-poll window

	cfg := tgbotapi.NewUpdate(0)
	cfg.Timeout = pollTimeout

	log.Info().Msg("Telegram bot polling started")

	for {
		// Exit immediately if context was cancelled between iterations.
		select {
		case <-ctx.Done():
			log.Info().Msg("Telegram bot stopped")
			return
		default:
		}

		updates, err := b.api.GetUpdates(cfg)
		if err != nil {
			// Check for cancellation before sleeping so that StopBot is not
			// delayed by the retry back-off.
			select {
			case <-ctx.Done():
				log.Info().Msg("Telegram bot stopped")
				return
			default:
			}
			log.Warn().Err(err).Msg("telegram: GetUpdates error, retrying in 3s")
			// Interruptible back-off: honours ctx cancellation immediately.
			select {
			case <-ctx.Done():
				log.Info().Msg("Telegram bot stopped")
				return
			case <-time.After(3 * time.Second):
			}
			continue
		}

		for _, update := range updates {
			if update.UpdateID >= cfg.Offset {
				cfg.Offset = update.UpdateID + 1
			}

			// Log every raw update to detect which types are actually arriving.
			log.Debug().
				Int("update_id", update.UpdateID).
				Bool("has_message", update.Message != nil).
				Bool("has_callback", update.CallbackQuery != nil).
				Bool("has_edited", update.EditedMessage != nil).
				Msg("telegram: raw update received")

			if update.CallbackQuery != nil {
				go b.handleCallback(ctx, update.CallbackQuery)
				continue
			}
			if update.Message == nil {
				continue
			}
			go b.handleMessage(ctx, update.Message)
		}
	}
}

// SendMessage sends a text message to a specific chat.
// Handles long messages by chunking at paragraph/newline boundaries (Telegram 4096 char limit).
// Markdown in the text is converted to Telegram-compatible HTML before sending.
func (b *Bot) SendMessage(chatID int64, text string) error {
	converted := markdownToTelegramHTML(text)
	chunks := chunkText(converted, 4096)

	for i, chunk := range chunks {
		msg := tgbotapi.NewMessage(chatID, chunk)
		msg.ParseMode = "HTML"

		_, err := b.api.Send(msg)
		if err != nil {
			// HTML parse failure → retry as plain text fallback.
			log.Warn().Err(err).Int("chunk", i).Msg("HTML send failed, retrying as plain text")
			msg.ParseMode = ""
			msg.Text = text // send original unescaped text as plain fallback
			if _, retryErr := b.api.Send(msg); retryErr != nil {
				return fmt.Errorf("send chunk %d: %w", i, retryErr)
			}
		}
	}
	return nil
}

// chunkText splits text into chunks that fit within maxLen.
// Prefers splitting at paragraph boundaries (\n\n), then newlines (\n).
func chunkText(text string, maxLen int) []string {
	if len(text) <= maxLen {
		return []string{text}
	}

	var chunks []string
	remaining := text

	for len(remaining) > 0 {
		if len(remaining) <= maxLen {
			chunks = append(chunks, remaining)
			break
		}

		chunk := remaining[:maxLen]
		cutAt := maxLen

		// Try paragraph boundary first.
		if idx := lastIndex(chunk, "\n\n"); idx > 0 {
			cutAt = idx + 2
		} else if idx := lastIndex(chunk, "\n"); idx > 0 {
			// Then newline boundary.
			cutAt = idx + 1
		}

		chunks = append(chunks, remaining[:cutAt])
		remaining = remaining[cutAt:]
	}

	return chunks
}

// lastIndex returns the last occurrence of sep in s, or -1.
func lastIndex(s, sep string) int {
	for i := len(s) - len(sep); i >= 0; i-- {
		if s[i:i+len(sep)] == sep {
			return i
		}
	}
	return -1
}

func (b *Bot) handleMessage(ctx context.Context, msg *tgbotapi.Message) {
	// Log every incoming message type for debugging.
	log.Debug().
		Int64("chat_id", msg.Chat.ID).
		Bool("has_text", msg.Text != "").
		Bool("has_photo", msg.Photo != nil && len(msg.Photo) > 0).
		Bool("has_voice", msg.Voice != nil).
		Bool("has_video", msg.Video != nil).
		Bool("has_document", msg.Document != nil).
		Bool("has_sticker", msg.Sticker != nil).
		Msg("telegram: incoming message")

	// Resolve Telegram user to internal UUID.
	telegramID := fmt.Sprintf("%d", msg.From.ID)
	chatID := msg.Chat.ID
	messageID := msg.MessageID

	displayName := strings.TrimSpace(msg.From.FirstName + " " + msg.From.LastName)
	userID := telegramID // fallback in case identity service is unavailable
	// convID is the conversation UUID used for message persistence.
	// It is only valid when identity resolution succeeds (userID becomes a UUID, not telegramID).
	convID := ""
	if b.identitySvc != nil {
		var err error
		resolved, err := b.identitySvc.ResolveUserIDWithName(identity.PlatformTelegram, telegramID, displayName)
		if err != nil {
			log.Error().Err(err).Str("telegram_id", telegramID).Msg("identity resolve failed, using telegram_id")
		} else {
			userID = resolved
			// Upsert a platform conversation so the web sidebar can show Telegram history.
			// thread_id = telegramID (numeric) so history lookup hits the correct LangGraph checkpoints.
			if b.db != nil {
				if _, dbErr := b.db.ExecContext(ctx, `
					INSERT INTO conversations (id, user_id, title, platform, thread_id)
					VALUES ($1::uuid, $1::text, '텔레그램', 'telegram', $2)
					ON CONFLICT (id) DO NOTHING
				`, userID, telegramID); dbErr != nil {
					log.Warn().Err(dbErr).Str("user_id", userID).Msg("telegram: upsert platform conversation failed")
				}
			}
			// Only use userID as convID when resolution succeeded (it's a UUID, not telegramID).
			if userID != telegramID {
				convID = userID
			}
		}
	}

	// Record user activity for proactive notification deferral.
	if b.tracker != nil {
		b.tracker.RecordMessage(userID)
	}

	// ── Policy gate ──────────────────────────────────────────────────────────
	// Enforce DM / Group policy before processing any user message or command.
	if !msg.IsCommand() || (msg.IsCommand() && msg.Command() != "start" && msg.Command() != "link") {
		dmPolicy, groupPolicy := b.loadPolicy()
		isGroup := msg.Chat.IsGroup() || msg.Chat.IsSuperGroup()

		if isGroup {
			switch groupPolicy {
			case "deny":
				// Silently ignore all group messages.
				return
			case "mention":
				// Only respond when the bot is @mentioned.
				mentioned := false
				for _, entity := range msg.Entities {
					if entity.Type == "mention" {
						mentionText := msg.Text[entity.Offset : entity.Offset+entity.Length]
						if strings.EqualFold(mentionText, "@"+b.api.Self.UserName) {
							mentioned = true
							break
						}
					}
				}
				if !mentioned {
					return
				}
			// "allow" — fall through, no restriction.
			}
		} else {
			// Direct message.
			switch dmPolicy {
			case "deny":
				b.SendMessage(chatID, "죄송해요, 현재 DM을 통한 메시지는 받지 않고 있어요.")
				return
			case "pairing":
				if !b.isApprovedContact(telegramID) {
					b.handlePairingRequest(chatID, telegramID, displayName, msg.Text)
					return
				}
			// "allow" — fall through.
			}
		}
	}
	// ── End policy gate ───────────────────────────────────────────────────────

	// Handle commands.
	if msg.IsCommand() {
		switch msg.Command() {
		case "start":
			b.handleStart(chatID)
		case "persona":
			b.handlePersona(chatID)
		case "skills":
			b.handleSkills(chatID, userID)
		case "link":
			b.handleLink(chatID, userID)
		}
		return
	}

	// Build the gRPC request from message content.
	// Always use telegramID as ThreadId so LangGraph checkpoints stay continuous
	// regardless of whether identity resolution succeeded.
	chatReq := &starnionv1.ChatRequest{
		UserId:   userID,
		Message:  msg.Text,
		ThreadId: telegramID,
	}

	// mirrorCh receives the MinIO-mirrored attachment for the file (if any).
	// Mirroring runs in a background goroutine so it never delays the agent call.
	mirrorCh := make(chan storage.FileAttachment, 1)

	// imgIDCh receives the images row ID for uploaded photos so that the
	// stream/unary handler can backfill the analysis column once the LLM responds.
	var imgIDCh chan int64

	// Handle photo messages.
	if msg.Photo != nil && len(msg.Photo) > 0 {
		// Pick the largest photo (last element).
		photo := msg.Photo[len(msg.Photo)-1]
		fileURL := b.getFileURL(photo.FileID)
		if fileURL != "" {
			// Pass the Telegram CDN URL to the agent for Gemini analysis.
			// Mirror to MinIO in the background so it never blocks the response.
			chatReq.File = &starnionv1.FileInput{
				FileType: "image",
				FileUrl:  fileURL,
				FileName: "photo.jpg",
			}
			photoCaption := msg.Caption
			if photoCaption == "" {
				photoCaption = "이 이미지를 분석해주세요."
			}
			imgIDCh = make(chan int64, 1)
			go func(u, caption string) {
				mirrorCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
				defer cancel()
				if att, err := b.mirrorToStorage(mirrorCtx, "photo.jpg", "image/jpeg", u); err != nil {
					log.Warn().Err(err).Msg("telegram: mirror photo to storage failed")
					imgIDCh <- 0 // signal that no record was created
				} else {
					mirrorCh <- att
					// Record uploaded photo to image gallery and send its DB row id
					// back so the streaming handler can update the analysis column.
					imgID := b.recordImageID(userID, att.URL, att.Name, att.Mime, att.Size, "uploaded", caption)
					imgIDCh <- imgID
				}
			}(fileURL, photoCaption)
			if chatReq.Message == "" {
				chatReq.Message = msg.Caption
			}
			if chatReq.Message == "" {
				chatReq.Message = "이 이미지를 분석해주세요."
			}
		}
	}

	// Handle voice messages.
	if msg.Voice != nil {
		fileURL := b.getFileURL(msg.Voice.FileID)
		if fileURL != "" {
			chatReq.File = &starnionv1.FileInput{
				FileType: "audio",
				FileUrl:  fileURL,
				FileName: "voice.ogg",
			}
			go func(u string, dur int) {
				mirrorCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
				defer cancel()
				if att, err := b.mirrorToStorage(mirrorCtx, "voice.ogg", "audio/ogg", u); err != nil {
					log.Warn().Err(err).Msg("telegram: mirror voice to storage failed")
				} else {
					mirrorCh <- att
					// Record uploaded voice to audio library.
					b.recordAudio(userID, att.URL, att.Name, att.Mime, att.Size, dur, "uploaded", "", "")
				}
			}(fileURL, msg.Voice.Duration)
			if chatReq.Message == "" {
				chatReq.Message = "이 음성을 텍스트로 변환해주세요."
			}
		}
	}

	// Handle video messages.
	if msg.Video != nil {
		fileURL := b.getFileURL(msg.Video.FileID)
		if fileURL != "" {
			chatReq.File = &starnionv1.FileInput{
				FileType: "video",
				FileUrl:  fileURL,
				FileName: "video.mp4",
			}
			go func(u string) {
				mirrorCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
				defer cancel()
				if att, err := b.mirrorToStorage(mirrorCtx, "video.mp4", "video/mp4", u); err != nil {
					log.Warn().Err(err).Msg("telegram: mirror video to storage failed")
				} else {
					mirrorCh <- att
				}
			}(fileURL)
			if chatReq.Message == "" {
				chatReq.Message = msg.Caption
			}
			if chatReq.Message == "" {
				chatReq.Message = "이 비디오를 분석해주세요."
			}
		}
	}

	// Handle document messages.
	if msg.Document != nil {
		fileURL := b.getFileURL(msg.Document.FileID)
		if fileURL != "" {
			docMime := msg.Document.MimeType
			if docMime == "" {
				docMime = "application/octet-stream"
			}
			chatReq.File = &starnionv1.FileInput{
				FileType: "document",
				FileUrl:  fileURL,
				FileName: msg.Document.FileName,
			}
			docName := msg.Document.FileName
			go func(u, name, mime string) {
				mirrorCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
				defer cancel()
				if att, err := b.mirrorToStorage(mirrorCtx, name, mime, u); err != nil {
					log.Warn().Err(err).Msg("telegram: mirror document to storage failed")
				} else {
					mirrorCh <- att
				}
			}(fileURL, docName, docMime)
			if chatReq.Message == "" {
				chatReq.Message = msg.Caption
			}
			if chatReq.Message == "" {
				chatReq.Message = "이 문서를 처리해주세요."
			}
		}
	}

	// Skip if no content at all.
	if chatReq.Message == "" && chatReq.File == nil {
		log.Warn().
			Int64("chat_id", msg.Chat.ID).
			Bool("has_photo", msg.Photo != nil && len(msg.Photo) > 0).
			Bool("has_voice", msg.Voice != nil).
			Bool("has_document", msg.Document != nil).
			Msg("telegram: skipping message — no text and no file (getFileURL may have failed)")
		return
	}

	log.Info().
		Str("user_id", userID).
		Str("text", chatReq.Message).
		Bool("has_file", chatReq.File != nil).
		Msg("processing telegram message")

	// 1. Persist user message immediately (without attachment — mirror is still running).
	//    When the background mirror goroutine finishes, it will UPDATE this row with the MinIO URL.
	userMsgID := b.saveMessage(convID, "user", chatReq.Message, nil)
	if userMsgID != "" && chatReq.File != nil {
		go func(id string) {
			select {
			case att := <-mirrorCh:
				b.updateMessageAttachment(id, []storage.FileAttachment{att})
			case <-time.After(30 * time.Second):
				log.Warn().Str("msg_id", id).Msg("telegram: mirror timed out, attachment not saved")
			}
		}(userMsgID)
	}

	// 2. Set 👀 reaction on the user's message to acknowledge receipt.
	b.setReaction(chatID, messageID, "👀")

	// 3. Try streaming first, fallback to unary on error.
	if err := b.handleMessageStream(ctx, chatID, messageID, userID, convID, chatReq, imgIDCh); err != nil {
		log.Warn().Err(err).Str("user_id", userID).Msg("stream failed, falling back to unary")
		b.handleMessageUnary(ctx, chatID, messageID, userID, convID, chatReq, imgIDCh)
	}
}

// handleMessageStream processes a chat request via server-side streaming.
// Sends an initial message to Telegram and progressively edits it as tokens arrive.
// imgIDCh (may be nil) carries the images row id for uploaded photos so
// that the analysis column can be backfilled once the LLM response is complete.
func (b *Bot) handleMessageStream(ctx context.Context, chatID int64, messageID int, userID, convID string, req *starnionv1.ChatRequest, imgIDCh chan int64) error {
	reqCtx, cancel := context.WithTimeout(ctx, 120*time.Second)
	defer cancel()

	stream, err := b.grpcClient.ChatStream(reqCtx, req)
	if err != nil {
		return fmt.Errorf("open stream: %w", err)
	}

	var (
		accumulated strings.Builder
		sentMsgID   int
		statusMsgID int // Status message ("생각중...", "도구 XXX 사용중...")
		lastEdit    time.Time
		lastLen     int
		attachments []storage.FileAttachment
	)
	const editInterval = 500 * time.Millisecond

	// Send initial "thinking" status message.
	thinkMsg := tgbotapi.NewMessage(chatID, "💭 생각중...")
	if sent, sendErr := b.api.Send(thinkMsg); sendErr == nil {
		statusMsgID = sent.MessageID
	}

	// editWithHTML edits an existing message using HTML-converted markdown.
	// Falls back to plain text if Telegram rejects the HTML (e.g. partial markdown during streaming).
	editWithHTML := func(msgID int, rawMD string) {
		final := markdownToTelegramHTML(rawMD)
		edit := tgbotapi.NewEditMessageText(chatID, msgID, final)
		edit.ParseMode = "HTML"
		if _, editErr := b.api.Send(edit); editErr != nil {
			edit.ParseMode = ""
			edit.Text = rawMD
			b.api.Send(edit) // best-effort plain fallback
		}
	}

	for {
		resp, err := stream.Recv()
		if err == io.EOF {
			break
		}
		if err != nil {
			// Clean up status message on stream error.
			if statusMsgID != 0 && sentMsgID == 0 {
				deleteMsg := tgbotapi.NewDeleteMessage(chatID, statusMsgID)
				b.api.Request(deleteMsg)
			}
			// If we already sent a partial message, complete it with error note.
			if sentMsgID != 0 {
				accumulated.WriteString("\n\n_(stream interrupted)_")
				editWithHTML(sentMsgID, accumulated.String())
				b.setReaction(chatID, messageID, "😢")
				return nil
			}
			return fmt.Errorf("recv: %w", err)
		}

		switch resp.Type {
		case starnionv1.ResponseType_TEXT:
			accumulated.WriteString(resp.Content)

			// First text chunk: transition status message or send new.
			if sentMsgID == 0 {
				if statusMsgID != 0 {
					// Reuse status message as the response message.
					sentMsgID = statusMsgID
					statusMsgID = 0
					editWithHTML(sentMsgID, accumulated.String())
				} else {
					// No status message: send as new message with HTML.
					final := markdownToTelegramHTML(accumulated.String())
					msg := tgbotapi.NewMessage(chatID, final)
					msg.ParseMode = "HTML"
					sent, sendErr := b.api.Send(msg)
					if sendErr != nil {
						// HTML failed: retry as plain text.
						msg.ParseMode = ""
						msg.Text = accumulated.String()
						sent, sendErr = b.api.Send(msg)
						if sendErr != nil {
							return fmt.Errorf("send initial: %w", sendErr)
						}
					}
					sentMsgID = sent.MessageID
				}
				lastEdit = time.Now()
				lastLen = accumulated.Len()
				continue
			}

			// Throttled edit: respect Telegram rate limits.
			if time.Since(lastEdit) >= editInterval && accumulated.Len() > lastLen {
				editWithHTML(sentMsgID, accumulated.String())
				lastEdit = time.Now()
				lastLen = accumulated.Len()
			}

		case starnionv1.ResponseType_STREAM_END:
			// Transition status message if text accumulated but not yet sent.
			if statusMsgID != 0 && sentMsgID == 0 && accumulated.Len() > 0 {
				sentMsgID = statusMsgID
				statusMsgID = 0
			}
			// Delete orphaned status message (no response text at all).
			if statusMsgID != 0 && sentMsgID == 0 {
				deleteMsg := tgbotapi.NewDeleteMessage(chatID, statusMsgID)
				b.api.Request(deleteMsg)
			}
			// Final edit: always apply HTML formatting regardless of lastLen.
			// (Intermediate edits may have sent plain text; this ensures the
			//  finished message is always rendered with proper HTML markup.)
			if sentMsgID != 0 && accumulated.Len() > 0 {
				editWithHTML(sentMsgID, accumulated.String())
			} else if sentMsgID == 0 && accumulated.Len() > 0 {
				// No edits were sent yet, send accumulated text as new message.
				if err := b.SendMessage(chatID, accumulated.String()); err != nil {
					log.Error().Err(err).Msg("failed to send final stream message")
				}
			}
			// Persist completed assistant message.
			if accumulated.Len() > 0 || len(attachments) > 0 {
				b.saveMessage(convID, "assistant", accumulated.String(), attachments)
			}
			// Backfill analysis column for the uploaded photo (if any).
			b.backfillImageAnalysis(imgIDCh, accumulated.String())
			b.setReaction(chatID, messageID, "👍")
			return nil

		case starnionv1.ResponseType_ERROR:
			errText := resp.Content
			if errText == "" {
				errText = "잠시 서비스에 문제가 있어요. 잠시 후 다시 시도해 주세요."
			}
			// Reuse status message for error display.
			if statusMsgID != 0 && sentMsgID == 0 {
				sentMsgID = statusMsgID
				statusMsgID = 0
			}
			if sentMsgID == 0 {
				b.SendMessage(chatID, errText)
			} else {
				accumulated.WriteString("\n\n" + errText)
				editWithHTML(sentMsgID, accumulated.String())
			}
			b.setReaction(chatID, messageID, "😢")
			return nil

		case starnionv1.ResponseType_FILE:
			b.sendFile(chatID, resp.FileData, resp.FileName, resp.FileMime)
			// Upload to MinIO and collect attachment for DB persistence.
			if att, uploadErr := b.uploadFileToStorage(reqCtx, resp.FileName, resp.FileMime, resp.FileData); uploadErr != nil {
				log.Warn().Err(uploadErr).Str("file", resp.FileName).Msg("telegram: file upload to storage failed")
			} else {
				attachments = append(attachments, att)
				if strings.HasPrefix(att.Mime, "image/") {
					b.recordImage(userID, att.URL, att.Name, att.Mime, att.Size, tgImageType(resp.FileName), req.Message)
				} else if strings.HasPrefix(att.Mime, "audio/") {
					b.recordAudio(userID, att.URL, att.Name, att.Mime, att.Size, 0, "generated", req.Message, "")
				} else {
					b.recordDocument(userID, att.URL, att.Name, att.Mime, att.Size)
				}
			}

		case starnionv1.ResponseType_TOOL_CALL:
			// Update status message with tool-specific text.
			if statusMsgID != 0 {
				statusText := getToolStatus(resp.ToolName)
				edit := tgbotapi.NewEditMessageText(chatID, statusMsgID, statusText)
				b.api.Send(edit) // best-effort
			}

		case starnionv1.ResponseType_TOOL_RESULT:
			// Ignored; tool results are processed internally by the agent.
		}
	}

	// Stream ended without explicit STREAM_END (graceful handling).
	if statusMsgID != 0 && sentMsgID == 0 && accumulated.Len() > 0 {
		sentMsgID = statusMsgID
		statusMsgID = 0
	}
	if statusMsgID != 0 && sentMsgID == 0 {
		deleteMsg := tgbotapi.NewDeleteMessage(chatID, statusMsgID)
		b.api.Request(deleteMsg)
	}
	if sentMsgID != 0 && accumulated.Len() > 0 {
		editWithHTML(sentMsgID, accumulated.String())
	} else if sentMsgID == 0 && accumulated.Len() > 0 {
		b.SendMessage(chatID, accumulated.String())
	}
	// Persist completed assistant message (EOF path).
	if accumulated.Len() > 0 || len(attachments) > 0 {
		b.saveMessage(convID, "assistant", accumulated.String(), attachments)
	}
	// Backfill analysis column for the uploaded photo (if any).
	b.backfillImageAnalysis(imgIDCh, accumulated.String())
	b.setReaction(chatID, messageID, "👍")
	return nil
}

// handleMessageUnary processes a chat request via unary gRPC call (fallback).
func (b *Bot) handleMessageUnary(ctx context.Context, chatID int64, messageID int, userID, convID string, req *starnionv1.ChatRequest, imgIDCh chan int64) {
	typingCtx, typingCancel := context.WithCancel(ctx)
	go b.typingLoop(typingCtx, chatID)

	reqCtx, cancel := context.WithTimeout(ctx, 120*time.Second)
	defer cancel()

	resp, err := b.grpcClient.Chat(reqCtx, req)
	typingCancel()

	if err != nil {
		log.Error().Err(err).Str("user_id", userID).Msg("gRPC chat (unary) failed")
		b.setReaction(chatID, messageID, "😢")
		reply := tgbotapi.NewMessage(chatID, "잠시 서비스에 문제가 있어요. 잠시 후 다시 시도해 주세요.")
		b.api.Send(reply)
		return
	}

	b.setReaction(chatID, messageID, "👍")

	var attachments []storage.FileAttachment

	// Send file if the response contains file data (e.g., generated documents).
	if len(resp.FileData) > 0 {
		b.sendFile(chatID, resp.FileData, resp.FileName, resp.FileMime)
		// Upload to MinIO for persistence.
		if att, uploadErr := b.uploadFileToStorage(reqCtx, resp.FileName, resp.FileMime, resp.FileData); uploadErr != nil {
			log.Warn().Err(uploadErr).Str("file", resp.FileName).Msg("telegram: file upload to storage failed (unary)")
		} else {
			attachments = append(attachments, att)
			if strings.HasPrefix(att.Mime, "image/") {
				b.recordImage(userID, att.URL, att.Name, att.Mime, att.Size, tgImageType(resp.FileName), req.Message)
			} else if strings.HasPrefix(att.Mime, "audio/") {
				b.recordAudio(userID, att.URL, att.Name, att.Mime, att.Size, 0, "generated", req.Message, "")
			} else {
				b.recordDocument(userID, att.URL, att.Name, att.Mime, att.Size)
			}
		}
	}

	if resp.Content != "" {
		if err := b.SendMessage(chatID, resp.Content); err != nil {
			log.Error().Err(err).Str("user_id", userID).Msg("failed to send telegram reply")
		}
	}

	// Persist assistant message.
	if resp.Content != "" || len(attachments) > 0 {
		b.saveMessage(convID, "assistant", resp.Content, attachments)
	}
	// Backfill analysis column for the uploaded photo (if any).
	b.backfillImageAnalysis(imgIDCh, resp.Content)
}

// typingLoop sends "typing" chat action every 4 seconds until ctx is cancelled.
// Telegram's typing indicator expires after ~5 seconds, so continuous refresh is needed.
// Inspired by openclaw's typing keepalive pattern with circuit breaker for 401 errors.
func (b *Bot) typingLoop(ctx context.Context, chatID int64) {
	// Send initial typing action immediately.
	// Use Request instead of Send because sendChatAction returns bool, not Message.
	action := tgbotapi.NewChatAction(chatID, tgbotapi.ChatTyping)
	if _, err := b.api.Request(action); err != nil {
		log.Debug().Err(err).Int64("chat_id", chatID).Msg("initial typing action failed")
		return // Don't loop if first attempt fails (circuit breaker).
	}

	ticker := time.NewTicker(4 * time.Second)
	defer ticker.Stop()

	consecutiveFailures := 0
	const maxFailures = 3

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			action := tgbotapi.NewChatAction(chatID, tgbotapi.ChatTyping)
			if _, err := b.api.Request(action); err != nil {
				consecutiveFailures++
				log.Debug().Err(err).Int("failures", consecutiveFailures).Msg("typing action failed")
				if consecutiveFailures >= maxFailures {
					log.Warn().Int64("chat_id", chatID).Msg("typing loop suspended after repeated failures")
					return
				}
			} else {
				consecutiveFailures = 0
			}
		}
	}
}

// setReaction sets an emoji reaction on a message using the Telegram Bot API.
// Uses direct HTTP call since go-telegram-bot-api v5 doesn't support setMessageReaction.
func (b *Bot) setReaction(chatID int64, messageID int, emoji string) {
	reaction := []map[string]string{
		{"type": "emoji", "emoji": emoji},
	}
	reactionJSON, _ := json.Marshal(reaction)

	params := url.Values{
		"chat_id":    {fmt.Sprintf("%d", chatID)},
		"message_id": {fmt.Sprintf("%d", messageID)},
		"reaction":   {string(reactionJSON)},
	}

	apiURL := fmt.Sprintf("https://api.telegram.org/bot%s/setMessageReaction", b.api.Token)
	resp, err := http.PostForm(apiURL, params)
	if err != nil {
		log.Debug().Err(err).Str("emoji", emoji).Msg("setMessageReaction failed")
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		log.Debug().Int("status", resp.StatusCode).Str("emoji", emoji).Msg("setMessageReaction non-200")
	}
}

// getFileURL retrieves the direct download URL for a Telegram file.
func (b *Bot) getFileURL(fileID string) string {
	fileConfig := tgbotapi.FileConfig{FileID: fileID}
	file, err := b.api.GetFile(fileConfig)
	if err != nil {
		log.Error().Err(err).Str("file_id", fileID).Msg("failed to get telegram file")
		return ""
	}
	return file.Link(b.api.Token)
}

// sendFile sends a binary file to a Telegram chat, choosing the appropriate
// send method based on MIME type (photo, voice, video, or generic document).
func (b *Bot) sendFile(chatID int64, data []byte, name, mime string) {
	if len(data) == 0 {
		return
	}
	fileBytes := tgbotapi.FileBytes{Name: name, Bytes: data}

	var msg tgbotapi.Chattable
	switch {
	case strings.HasPrefix(mime, "image/"):
		msg = tgbotapi.NewPhoto(chatID, fileBytes)
	case mime == "audio/ogg":
		msg = tgbotapi.NewVoice(chatID, fileBytes)
	case strings.HasPrefix(mime, "audio/"):
		msg = tgbotapi.NewAudio(chatID, fileBytes)
	case strings.HasPrefix(mime, "video/"):
		msg = tgbotapi.NewVideo(chatID, fileBytes)
	default:
		msg = tgbotapi.NewDocument(chatID, fileBytes)
	}

	if _, err := b.api.Send(msg); err != nil {
		log.Error().Err(err).Str("name", name).Str("mime", mime).Msg("failed to send file")
	}
}

// mirrorToStorage downloads a file from srcURL (e.g. Telegram CDN) and uploads
// it to MinIO for permanent, browser-accessible storage.
// Telegram CDN URLs are signed/temporary; mirroring ensures the web UI can display them.
func (b *Bot) mirrorToStorage(ctx context.Context, fileName, mime, srcURL string) (storage.FileAttachment, error) {
	if b.store == nil {
		return storage.FileAttachment{}, fmt.Errorf("storage not configured")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, srcURL, nil)
	if err != nil {
		return storage.FileAttachment{}, fmt.Errorf("create request: %w", err)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return storage.FileAttachment{}, fmt.Errorf("download %s: %w", fileName, err)
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return storage.FileAttachment{}, fmt.Errorf("read %s: %w", fileName, err)
	}
	return b.store.Upload(ctx, fileName, mime, data)
}

// saveMessage persists a chat message to the messages table.
// Returns the generated message UUID so callers can update it later (e.g. add attachments).
// convID must be a valid UUID (the resolved userID); returns "" and skips when empty or db is nil.
func (b *Bot) saveMessage(convID, role, content string, attachments []storage.FileAttachment) string {
	if b.db == nil || convID == "" {
		return ""
	}
	var attJSON []byte
	if len(attachments) > 0 {
		var err error
		attJSON, err = json.Marshal(attachments)
		if err != nil {
			log.Warn().Err(err).Msg("telegram: marshal attachments failed")
		}
	}
	var msgID string
	err := b.db.QueryRowContext(context.Background(), `
		INSERT INTO messages (conversation_id, role, content, attachments)
		VALUES ($1::uuid, $2, $3, $4)
		RETURNING id
	`, convID, role, content, attJSON).Scan(&msgID)
	if err != nil {
		log.Warn().Err(err).Str("conversation_id", convID).Msg("telegram: saveMessage failed")
		return ""
	}
	return msgID
}

// updateMessageAttachment sets the attachments column on an already-saved message.
// Used when a background mirror completes after the message was initially saved without attachments.
func (b *Bot) updateMessageAttachment(msgID string, attachments []storage.FileAttachment) {
	if b.db == nil || msgID == "" || len(attachments) == 0 {
		return
	}
	attJSON, err := json.Marshal(attachments)
	if err != nil {
		log.Warn().Err(err).Msg("telegram: marshal attachments for update failed")
		return
	}
	if _, err = b.db.ExecContext(context.Background(), `
		UPDATE messages SET attachments = $1 WHERE id = $2::uuid
	`, attJSON, msgID); err != nil {
		log.Warn().Err(err).Str("msg_id", msgID).Msg("telegram: updateMessageAttachment failed")
	}
}

// uploadFileToStorage uploads file bytes to MinIO and returns the attachment.
// Returns an error when MinIO is not configured or upload fails.
func (b *Bot) uploadFileToStorage(ctx context.Context, name, mime string, data []byte) (storage.FileAttachment, error) {
	if b.store == nil {
		return storage.FileAttachment{}, fmt.Errorf("storage not configured")
	}
	return b.store.Upload(ctx, name, mime, data)
}

func (b *Bot) handleStart(chatID int64) {
	text := "안녕하세요! 저는 니온(Starnion)이에요.\n" +
		"가계부 기록, 지출 조회, 일상 기록 등을 도와드릴게요.\n" +
		"편하게 말씀해 주세요!"
	msg := tgbotapi.NewMessage(chatID, text)
	if _, err := b.api.Send(msg); err != nil {
		log.Error().Err(err).Int64("chat_id", chatID).Msg("failed to send /start reply")
	}
}

// handleLink generates a one-time pairing code and sends it to the user.
// The user enters this code in the web app to link their accounts.
func (b *Bot) handleLink(chatID int64, userID string) {
	if b.identitySvc == nil {
		b.SendMessage(chatID, "계정 연결 기능을 사용할 수 없어요.")
		return
	}

	code, err := b.identitySvc.GenerateLinkCode(userID)
	if err != nil {
		log.Error().Err(err).Str("user_id", userID).Msg("failed to generate link code")
		b.SendMessage(chatID, "코드 생성에 실패했어요. 잠시 후 다시 시도해 주세요.")
		return
	}

	text := fmt.Sprintf(
		"🔗 계정 연결 코드: *%s*\n\n"+
			"웹 앱의 채널 → 채널 설정 → 계정 연결에서 이 코드를 입력하세요.\n"+
			"_코드는 10분 후 만료됩니다._",
		code,
	)
	if err := b.SendMessage(chatID, text); err != nil {
		log.Error().Err(err).Int64("chat_id", chatID).Msg("failed to send link code")
	}
}

// toolStatusText maps tool names to Korean status messages with emoji.
var toolStatusText = map[string]string{
	"save_finance":           "💰 가계부 기록중...",
	"get_monthly_total":      "📊 지출 조회중...",
	"set_budget":             "📊 예산 설정중...",
	"get_budget_status":      "📊 예산 확인중...",
	"save_daily_log":         "📔 일기 저장중...",
	"set_goal":               "🎯 목표 설정중...",
	"get_goals":              "🎯 목표 조회중...",
	"update_goal_status":     "🎯 목표 업데이트중...",
	"create_schedule":        "📅 일정 생성중...",
	"list_schedules":         "📅 일정 조회중...",
	"cancel_schedule":        "📅 일정 취소중...",
	"retrieve_memory":        "🧠 기억 검색중...",
	"analyze_image":          "🖼️ 이미지 분석중...",
	"generate_image":         "🎨 이미지 생성중...",
	"edit_image":             "🖼️ 이미지 편집중...",
	"parse_document":         "📄 문서 분석중...",
	"generate_document":      "📄 문서 생성중...",
	"transcribe_audio":       "🎵 음성 인식중...",
	"generate_audio":         "🎵 음성 생성중...",
	"analyze_video":          "🎬 비디오 분석중...",
	"generate_video":         "🎬 비디오 생성중...",
	"web_search":             "🔍 웹 검색중...",
	"web_fetch":              "📄 웹페이지 읽는중...",
	"get_weather":            "🌤️ 날씨 조회중...",
	"get_forecast":           "🌤️ 일기예보 조회중...",
	"summarize_url":          "📝 URL 요약중...",
	"summarize_text":         "📝 텍스트 요약중...",
	"translate_text":         "🌐 번역중...",
	"generate_qrcode":        "🔲 QR 코드 생성중...",
	"calculate":              "🧮 계산중...",
	"set_reminder":           "⏰ 알림 설정중...",
	"list_reminders":         "⏰ 알림 조회중...",
	"delete_reminder":        "⏰ 알림 삭제중...",
	"google_auth":            "🔗 구글 연동중...",
	"google_disconnect":      "🔗 구글 연동 해제중...",
	"google_calendar_list":   "📅 구글 캘린더 조회중...",
	"google_calendar_create": "📅 구글 캘린더 생성중...",
	"google_docs_create":     "📝 구글 문서 생성중...",
	"google_docs_read":       "📝 구글 문서 읽는중...",
	"google_tasks_list":      "✅ 구글 태스크 조회중...",
	"google_tasks_create":    "✅ 구글 태스크 생성중...",
	"google_drive_upload":    "📁 구글 드라이브 업로드중...",
	"google_drive_list":      "📁 구글 드라이브 조회중...",
	"google_mail_list":       "📧 메일 조회중...",
	"google_mail_send":       "📧 메일 전송중...",
	"convert_currency":       "💱 환율 변환중...",
	"get_exchange_rate":      "💱 환율 조회중...",
	"set_dday":               "📆 디데이 설정중...",
	"list_ddays":             "📆 디데이 조회중...",
	"delete_dday":            "📆 디데이 삭제중...",
	"random_pick":            "🎲 랜덤 선택중...",
	"save_memo":              "🗒️ 메모 저장중...",
	"list_memos":             "🗒️ 메모 조회중...",
	"delete_memo":            "🗒️ 메모 삭제중...",
	"convert_unit":           "📐 단위 변환중...",
	"get_world_time":         "🕐 세계시간 조회중...",
	"convert_timezone":       "🕐 시간대 변환중...",
	"count_text":             "✏️ 글자수 분석중...",
	"encode_decode":          "🔐 인코딩 처리중...",
	"generate_hash":          "🔑 해시 생성중...",
	"convert_color":          "🎨 색상 변환중...",
	"get_horoscope":          "♈ 운세 조회중...",
	"lookup_ip":              "📡 IP 조회중...",
}

// getToolStatus returns a Korean status message for the given tool name.
func getToolStatus(toolName string) string {
	if text, ok := toolStatusText[toolName]; ok {
		return text
	}
	return fmt.Sprintf("⏳ %s 처리중...", toolName)
}

// isApprovedContact checks whether telegramID is in the owner's approved contacts list.
func (b *Bot) isApprovedContact(telegramID string) bool {
	if b.db == nil || b.ownerUserID == "" {
		return true // fail-open when DB unavailable
	}
	var exists bool
	err := b.db.QueryRowContext(context.Background(), `
		SELECT EXISTS(
			SELECT 1 FROM telegram_approved_contacts
			WHERE owner_user_id = $1 AND telegram_id = $2
		)
	`, b.ownerUserID, telegramID).Scan(&exists)
	if err != nil {
		log.Warn().Err(err).Msg("isApprovedContact query failed, failing open")
		return true
	}
	return exists
}

// handlePairingRequest creates or updates a pairing request and notifies the sender.
func (b *Bot) handlePairingRequest(chatID int64, telegramID, displayName, messageText string) {
	if b.db == nil || b.ownerUserID == "" {
		b.SendMessage(chatID, "연결 요청을 처리할 수 없어요. 잠시 후 다시 시도해 주세요.")
		return
	}

	_, err := b.db.ExecContext(context.Background(), `
		INSERT INTO telegram_pairing_requests
			(owner_user_id, telegram_id, display_name, message_text, status)
		VALUES ($1, $2, $3, $4, 'pending')
		ON CONFLICT (owner_user_id, telegram_id)
		DO UPDATE SET
			display_name  = EXCLUDED.display_name,
			message_text  = EXCLUDED.message_text,
			status        = 'pending',
			requested_at  = NOW(),
			resolved_at   = NULL
	`, b.ownerUserID, telegramID, displayName, messageText)
	if err != nil {
		log.Warn().Err(err).Str("telegram_id", telegramID).Msg("handlePairingRequest: upsert failed")
	}

	b.SendMessage(chatID, "연결 요청을 보냈어요. 봇 소유자가 승인하면 대화를 시작할 수 있어요.")
}

// personaNames maps persona IDs to display labels with emoji.
var personaNames = map[string]string{
	"assistant": "\U0001f916 기본 비서",
	"finance":   "\U0001f4ca 금융 전문가",
	"buddy":     "\U0001f60a 친한 친구",
	"coach":     "\U0001f4aa 재정 코치",
	"analyst":   "\U0001f50d 데이터 분석가",
}

// handlePersona sends an inline keyboard for persona selection.
func (b *Bot) handlePersona(chatID int64) {
	keyboard := tgbotapi.NewInlineKeyboardMarkup(
		tgbotapi.NewInlineKeyboardRow(
			tgbotapi.NewInlineKeyboardButtonData("\U0001f916 기본 비서", "persona:assistant"),
			tgbotapi.NewInlineKeyboardButtonData("\U0001f4ca 금융 전문가", "persona:finance"),
		),
		tgbotapi.NewInlineKeyboardRow(
			tgbotapi.NewInlineKeyboardButtonData("\U0001f60a 친한 친구", "persona:buddy"),
			tgbotapi.NewInlineKeyboardButtonData("\U0001f4aa 재정 코치", "persona:coach"),
		),
		tgbotapi.NewInlineKeyboardRow(
			tgbotapi.NewInlineKeyboardButtonData("\U0001f50d 데이터 분석가", "persona:analyst"),
		),
	)

	msg := tgbotapi.NewMessage(chatID, "어떤 스타일로 대화할까요? 선택해 주세요!")
	msg.ReplyMarkup = keyboard
	if _, err := b.api.Send(msg); err != nil {
		log.Error().Err(err).Int64("chat_id", chatID).Msg("failed to send /persona keyboard")
	}
}

// handleCallback processes inline keyboard callbacks (e.g. persona selection, skill toggle).
func (b *Bot) handleCallback(ctx context.Context, callback *tgbotapi.CallbackQuery) {
	data := callback.Data
	chatID := callback.Message.Chat.ID

	// Resolve Telegram user to internal UUID.
	telegramID := fmt.Sprintf("%d", callback.From.ID)
	userID := telegramID
	if b.identitySvc != nil {
		var err error
		userID, err = b.identitySvc.ResolveUserID(identity.PlatformTelegram, telegramID)
		if err != nil {
			log.Warn().Err(err).Str("telegram_id", telegramID).Msg("identity resolve failed in callback")
		}
	}

	if strings.HasPrefix(data, "skill:toggle:") {
		b.handleSkillToggle(ctx, callback, chatID, userID)
		return
	}

	if !strings.HasPrefix(data, "persona:") {
		return
	}

	personaID := strings.TrimPrefix(data, "persona:")

	// Validate persona ID.
	if _, ok := personaNames[personaID]; !ok {
		return
	}

	// personaNameByID maps Telegram persona IDs to the Korean names stored in personas.
	personaNameByID := map[string]string{
		"assistant": "기본 비서",
		"finance":   "금융 전문가",
		"buddy":     "친한 친구",
		"coach":     "재정 코치",
		"analyst":   "데이터 분석가",
	}

	if b.db != nil {
		dbCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
		defer cancel()

		personaName := personaNameByID[personaID]

		// Update personas: clear old default, set new default by name.
		// This is the primary mechanism used by the Python agent.
		tx, txErr := b.db.BeginTx(dbCtx, nil)
		if txErr == nil {
			_, err1 := tx.ExecContext(dbCtx,
				`UPDATE personas SET is_default = FALSE WHERE user_id = $1`, userID)
			_, err2 := tx.ExecContext(dbCtx,
				`UPDATE personas SET is_default = TRUE, updated_at = NOW()
				 WHERE user_id = $1 AND name = $2`, userID, personaName)
			if err1 != nil || err2 != nil {
				tx.Rollback() //nolint:errcheck
				log.Error().Err(err1).Err(err2).Str("user_id", userID).
					Str("persona", personaID).Msg("failed to update personas default")
			} else if err := tx.Commit(); err != nil {
				log.Error().Err(err).Str("user_id", userID).Msg("failed to commit persona tx")
			}
		}

		_, err := b.db.ExecContext(dbCtx, `
			UPDATE users
			SET preferences = preferences || $1::jsonb,
			    updated_at = NOW()
			WHERE id = $2
		`, fmt.Sprintf(`{"persona":"%s"}`, personaID), userID)
		if err != nil {
			log.Error().Err(err).Str("user_id", userID).Str("persona", personaID).Msg("failed to update users persona preference")
		}
	}

	// Replace the keyboard message with a confirmation.
	confirmText := fmt.Sprintf("%s 모드로 전환했어요!", personaNames[personaID])
	edit := tgbotapi.NewEditMessageText(chatID, callback.Message.MessageID, confirmText)
	if _, err := b.api.Send(edit); err != nil {
		log.Debug().Err(err).Msg("failed to edit persona confirmation message")
	}

	// Answer the callback to dismiss the loading indicator.
	callbackCfg := tgbotapi.NewCallback(callback.ID, "")
	if _, err := b.api.Request(callbackCfg); err != nil {
		log.Debug().Err(err).Msg("failed to answer callback query")
	}

	log.Info().Str("user_id", userID).Str("persona", personaID).Msg("persona changed")
}

// handleSkills sends an inline keyboard showing all toggleable skills.
func (b *Bot) handleSkills(chatID int64, userID string) {
	if b.skillService == nil {
		b.SendMessage(chatID, "스킬 관리 기능이 아직 준비되지 않았어요.")
		return
	}

	skills, err := b.skillService.GetUserSkills(userID)
	if err != nil {
		log.Error().Err(err).Str("user_id", userID).Msg("failed to get user skills")
		b.SendMessage(chatID, "스킬 목록을 불러올 수 없어요.")
		return
	}

	if len(skills) == 0 {
		b.SendMessage(chatID, "등록된 스킬이 없어요.")
		return
	}

	keyboard := b.buildSkillsKeyboard(skills)
	msg := tgbotapi.NewMessage(chatID, "기능을 켜고 끌 수 있어요. 버튼을 눌러 토글하세요.")
	msg.ReplyMarkup = keyboard
	if _, err := b.api.Send(msg); err != nil {
		log.Error().Err(err).Int64("chat_id", chatID).Msg("failed to send /skills keyboard")
	}
}

// buildSkillsKeyboard creates an inline keyboard with toggle buttons for each skill.
func (b *Bot) buildSkillsKeyboard(skills []skill.SkillView) tgbotapi.InlineKeyboardMarkup {
	var rows [][]tgbotapi.InlineKeyboardButton
	for i := 0; i < len(skills); i += 2 {
		var row []tgbotapi.InlineKeyboardButton
		for j := i; j < i+2 && j < len(skills); j++ {
			s := skills[j]
			status := "OFF"
			if s.Enabled {
				status = "ON"
			}
			label := fmt.Sprintf("%s %s [%s]", s.Emoji, s.Name, status)
			row = append(row, tgbotapi.NewInlineKeyboardButtonData(label, "skill:toggle:"+s.ID))
		}
		rows = append(rows, row)
	}
	return tgbotapi.NewInlineKeyboardMarkup(rows...)
}

// handleSkillToggle processes a skill toggle callback.
func (b *Bot) handleSkillToggle(ctx context.Context, callback *tgbotapi.CallbackQuery, chatID int64, userID string) {
	skillID := strings.TrimPrefix(callback.Data, "skill:toggle:")

	if b.skillService == nil {
		return
	}

	enabled, err := b.skillService.Toggle(userID, skillID)
	if err != nil {
		log.Error().Err(err).Str("user_id", userID).Str("skill_id", skillID).Msg("skill toggle failed")
		callbackCfg := tgbotapi.NewCallback(callback.ID, "토글할 수 없는 스킬이에요.")
		b.api.Request(callbackCfg)
		return
	}

	status := "꺼짐"
	if enabled {
		status = "켜짐"
	}

	// Refresh the keyboard with updated states.
	skills, err := b.skillService.GetUserSkills(userID)
	if err == nil && len(skills) > 0 {
		keyboard := b.buildSkillsKeyboard(skills)
		edit := tgbotapi.NewEditMessageReplyMarkup(chatID, callback.Message.MessageID, keyboard)
		b.api.Send(edit)
	}

	callbackCfg := tgbotapi.NewCallback(callback.ID, fmt.Sprintf("%s: %s", skillID, status))
	b.api.Request(callbackCfg)

	log.Info().Str("user_id", userID).Str("skill_id", skillID).Bool("enabled", enabled).Msg("skill toggled")
}

// recordDocument inserts a documents row for a generated document file.
func (b *Bot) recordDocument(userID, url, name, mime string, size int64) {
	if b.db == nil {
		return
	}
	// Only record known document MIME types.
	switch mime {
	case "application/pdf",
		"application/msword",
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		"application/vnd.ms-excel",
		"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		"application/vnd.ms-powerpoint",
		"application/vnd.openxmlformats-officedocument.presentationml.presentation",
		"text/plain", "text/markdown", "text/csv":
		// allowed
	default:
		return
	}
	parts := strings.Split(url, "/")
	objectKey := ""
	if len(parts) >= 2 {
		objectKey = parts[len(parts)-2] + "/" + parts[len(parts)-1]
	}
	_, err := b.db.ExecContext(context.Background(), `
		INSERT INTO documents (user_id, title, file_type, file_url, object_key, size)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, userID, name, mime, url, objectKey, size)
	if err != nil {
		log.Warn().Err(err).Str("user_id", userID).Str("url", url).Msg("telegram: record document failed")
	}
}

// recordImage inserts an image row into images (fire-and-forget).
func (b *Bot) recordImage(userID, url, name, mime string, size int64, imgType, prompt string) {
	b.recordImageID(userID, url, name, mime, size, imgType, prompt)
}

// recordImageID inserts a images row and returns the new row id (0 on failure).
func (b *Bot) recordImageID(userID, url, name, mime string, size int64, imgType, prompt string) int64 {
	if b.db == nil || !strings.HasPrefix(mime, "image/") {
		return 0
	}
	var id int64
	err := b.db.QueryRowContext(context.Background(), `
		INSERT INTO images (user_id, url, name, mime, size, source, type, prompt)
		VALUES ($1, $2, $3, $4, $5, 'telegram', $6, $7)
		RETURNING id
	`, userID, url, name, mime, size, imgType, prompt).Scan(&id)
	if err != nil {
		log.Warn().Err(err).Str("user_id", userID).Msg("telegram: record image failed")
		return 0
	}
	return id
}

// backfillImageAnalysis reads an image row id from imgIDCh (with a short timeout)
// and calls updateImageAnalysis if a positive id and non-empty analysis are available.
// imgIDCh may be nil (non-photo messages) — in that case this is a no-op.
func (b *Bot) backfillImageAnalysis(imgIDCh chan int64, analysis string) {
	if imgIDCh == nil || analysis == "" {
		return
	}
	var imgID int64
	select {
	case imgID = <-imgIDCh:
	case <-time.After(5 * time.Second):
		log.Warn().Msg("telegram: photo id not received in time, analysis not backfilled")
		return
	}
	b.updateImageAnalysis(imgID, analysis)
}

// updateImageAnalysis sets the analysis text on an existing images row and marks it as analyzed.
func (b *Bot) updateImageAnalysis(id int64, analysis string) {
	if b.db == nil || id == 0 || analysis == "" {
		return
	}
	_, err := b.db.ExecContext(context.Background(), `
		UPDATE images SET analysis = $1, type = 'analyzed' WHERE id = $2
	`, analysis, id)
	if err != nil {
		log.Warn().Err(err).Int64("id", id).Msg("telegram: update image analysis failed")
	}
}

// tgImageType infers 'generated' or 'edited' from agent file name.
func tgImageType(name string) string {
	if strings.HasPrefix(name, "edited") {
		return "edited"
	}
	return "generated"
}

// recordAudio inserts an audio row into audios.
// audioType: 'uploaded' | 'recorded' | 'generated'
func (b *Bot) recordAudio(userID, url, name, mime string, size int64, duration int, audioType, prompt, transcript string) {
	if b.db == nil || !strings.HasPrefix(mime, "audio/") {
		return
	}
	_, err := b.db.ExecContext(context.Background(), `
		INSERT INTO audios (user_id, url, name, mime, size, duration, source, type, prompt, transcript)
		VALUES ($1, $2, $3, $4, $5, $6, 'telegram', $7, $8, $9)
	`, userID, url, name, mime, size, duration, audioType, prompt, transcript)
	if err != nil {
		log.Warn().Err(err).Str("user_id", userID).Msg("telegram: record audio failed")
	}
}
