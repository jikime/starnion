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
	"time"

	jikiv1 "github.com/jikime/jiki/gateway/gen/jiki/v1"
	"github.com/jikime/jiki/gateway/internal/activity"
	"github.com/jikime/jiki/gateway/internal/identity"
	"github.com/jikime/jiki/gateway/internal/skill"
	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"
	"github.com/rs/zerolog/log"
	"google.golang.org/grpc"
)

// Bot wraps the Telegram bot API and forwards messages to the agent via gRPC.
type Bot struct {
	api          *tgbotapi.BotAPI
	grpcClient   jikiv1.AgentServiceClient
	tracker      *activity.Tracker
	db           *sql.DB
	skillService *skill.Service
	identitySvc  *identity.Service
}

// NewBot creates a new Telegram bot connected to the agent gRPC service.
func NewBot(token string, grpcConn *grpc.ClientConn, tracker *activity.Tracker, db *sql.DB, skillSvc *skill.Service, identitySvc *identity.Service) (*Bot, error) {
	api, err := tgbotapi.NewBotAPI(token)
	if err != nil {
		return nil, fmt.Errorf("telegram bot init: %w", err)
	}

	log.Info().Str("username", api.Self.UserName).Msg("Telegram bot authorised")

	return &Bot{
		api:          api,
		grpcClient:   jikiv1.NewAgentServiceClient(grpcConn),
		tracker:      tracker,
		db:           db,
		skillService: skillSvc,
		identitySvc:  identitySvc,
	}, nil
}

// Run starts polling for Telegram updates and processing them.
// It blocks until ctx is cancelled.
func (b *Bot) Run(ctx context.Context) {
	u := tgbotapi.NewUpdate(0)
	u.Timeout = 30

	updates := b.api.GetUpdatesChan(u)

	log.Info().Msg("Telegram bot polling started")

	for {
		select {
		case <-ctx.Done():
			b.api.StopReceivingUpdates()
			log.Info().Msg("Telegram bot stopped")
			return
		case update := <-updates:
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
// Supports Markdown formatting with HTML fallback on parse failure.
func (b *Bot) SendMessage(chatID int64, text string) error {
	chunks := chunkText(text, 4096)

	for i, chunk := range chunks {
		msg := tgbotapi.NewMessage(chatID, chunk)
		msg.ParseMode = "Markdown"

		_, err := b.api.Send(msg)
		if err != nil {
			// Markdown parse failure → retry as plain text (openclaw pattern).
			log.Warn().Err(err).Int("chunk", i).Msg("Markdown send failed, retrying as plain text")
			msg.ParseMode = ""
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
	// Resolve Telegram user to internal UUID.
	telegramID := fmt.Sprintf("%d", msg.From.ID)
	chatID := msg.Chat.ID
	messageID := msg.MessageID

	displayName := strings.TrimSpace(msg.From.FirstName + " " + msg.From.LastName)
	userID := telegramID // fallback in case identity service is unavailable
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
					VALUES ($1, $1, '텔레그램', 'telegram', $2)
					ON CONFLICT (id) DO NOTHING
				`, userID, telegramID); dbErr != nil {
					log.Warn().Err(dbErr).Str("user_id", userID).Msg("telegram: upsert platform conversation failed")
				}
			}
		}
	}

	// Record user activity for proactive notification deferral.
	if b.tracker != nil {
		b.tracker.RecordMessage(userID)
	}

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
	chatReq := &jikiv1.ChatRequest{
		UserId:   userID,
		Message:  msg.Text,
		ThreadId: telegramID,
	}

	// Handle photo messages.
	if msg.Photo != nil && len(msg.Photo) > 0 {
		// Pick the largest photo (last element).
		photo := msg.Photo[len(msg.Photo)-1]
		fileURL := b.getFileURL(photo.FileID)
		if fileURL != "" {
			chatReq.File = &jikiv1.FileInput{
				FileType: "image",
				FileUrl:  fileURL,
				FileName: "photo.jpg",
			}
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
			chatReq.File = &jikiv1.FileInput{
				FileType: "audio",
				FileUrl:  fileURL,
				FileName: "voice.ogg",
			}
			if chatReq.Message == "" {
				chatReq.Message = "이 음성을 텍스트로 변환해주세요."
			}
		}
	}

	// Handle video messages.
	if msg.Video != nil {
		fileURL := b.getFileURL(msg.Video.FileID)
		if fileURL != "" {
			chatReq.File = &jikiv1.FileInput{
				FileType: "video",
				FileUrl:  fileURL,
				FileName: "video.mp4",
			}
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
			chatReq.File = &jikiv1.FileInput{
				FileType: "document",
				FileUrl:  fileURL,
				FileName: msg.Document.FileName,
			}
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
		return
	}

	log.Info().
		Str("user_id", userID).
		Str("text", chatReq.Message).
		Bool("has_file", chatReq.File != nil).
		Msg("processing telegram message")

	// 1. Set 👀 reaction on the user's message to acknowledge receipt.
	b.setReaction(chatID, messageID, "👀")

	// 2. Try streaming first, fallback to unary on error.
	if err := b.handleMessageStream(ctx, chatID, messageID, userID, chatReq); err != nil {
		log.Warn().Err(err).Str("user_id", userID).Msg("stream failed, falling back to unary")
		b.handleMessageUnary(ctx, chatID, messageID, userID, chatReq)
	}
}

// handleMessageStream processes a chat request via server-side streaming.
// Sends an initial message to Telegram and progressively edits it as tokens arrive.
func (b *Bot) handleMessageStream(ctx context.Context, chatID int64, messageID int, userID string, req *jikiv1.ChatRequest) error {
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
	)
	const editInterval = 500 * time.Millisecond

	// Send initial "thinking" status message.
	thinkMsg := tgbotapi.NewMessage(chatID, "💭 생각중...")
	if sent, sendErr := b.api.Send(thinkMsg); sendErr == nil {
		statusMsgID = sent.MessageID
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
				edit := tgbotapi.NewEditMessageText(chatID, sentMsgID, accumulated.String())
				b.api.Send(edit)
				b.setReaction(chatID, messageID, "😢")
				return nil
			}
			return fmt.Errorf("recv: %w", err)
		}

		switch resp.Type {
		case jikiv1.ResponseType_TEXT:
			accumulated.WriteString(resp.Content)

			// First text chunk: transition status message or send new.
			if sentMsgID == 0 {
				if statusMsgID != 0 {
					// Reuse status message as the response message.
					sentMsgID = statusMsgID
					statusMsgID = 0
					edit := tgbotapi.NewEditMessageText(chatID, sentMsgID, accumulated.String())
					b.api.Send(edit) // best-effort
				} else {
					sent, sendErr := b.api.Send(tgbotapi.NewMessage(chatID, accumulated.String()))
					if sendErr != nil {
						return fmt.Errorf("send initial: %w", sendErr)
					}
					sentMsgID = sent.MessageID
				}
				lastEdit = time.Now()
				lastLen = accumulated.Len()
				continue
			}

			// Throttled edit: respect Telegram rate limits.
			if time.Since(lastEdit) >= editInterval && accumulated.Len() > lastLen {
				edit := tgbotapi.NewEditMessageText(chatID, sentMsgID, accumulated.String())
				b.api.Send(edit) // best-effort
				lastEdit = time.Now()
				lastLen = accumulated.Len()
			}

		case jikiv1.ResponseType_STREAM_END:
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
			// Final edit with Markdown formatting.
			if sentMsgID != 0 && accumulated.Len() > lastLen {
				final := accumulated.String()
				edit := tgbotapi.NewEditMessageText(chatID, sentMsgID, final)
				edit.ParseMode = "Markdown"
				if _, editErr := b.api.Send(edit); editErr != nil {
					// Markdown parse failure → retry as plain text.
					edit.ParseMode = ""
					b.api.Send(edit)
				}
			} else if sentMsgID == 0 && accumulated.Len() > 0 {
				// No edits were sent yet, send accumulated text as new message.
				if err := b.SendMessage(chatID, accumulated.String()); err != nil {
					log.Error().Err(err).Msg("failed to send final stream message")
				}
			}
			b.setReaction(chatID, messageID, "👍")
			return nil

		case jikiv1.ResponseType_ERROR:
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
				edit := tgbotapi.NewEditMessageText(chatID, sentMsgID, accumulated.String())
				b.api.Send(edit)
			}
			b.setReaction(chatID, messageID, "😢")
			return nil

		case jikiv1.ResponseType_FILE:
			b.sendFile(chatID, resp.FileData, resp.FileName, resp.FileMime)

		case jikiv1.ResponseType_TOOL_CALL:
			// Update status message with tool-specific text.
			if statusMsgID != 0 {
				statusText := getToolStatus(resp.ToolName)
				edit := tgbotapi.NewEditMessageText(chatID, statusMsgID, statusText)
				b.api.Send(edit) // best-effort
			}

		case jikiv1.ResponseType_TOOL_RESULT:
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
	if sentMsgID != 0 && accumulated.Len() > lastLen {
		final := accumulated.String()
		edit := tgbotapi.NewEditMessageText(chatID, sentMsgID, final)
		edit.ParseMode = "Markdown"
		if _, editErr := b.api.Send(edit); editErr != nil {
			edit.ParseMode = ""
			b.api.Send(edit)
		}
	} else if sentMsgID == 0 && accumulated.Len() > 0 {
		b.SendMessage(chatID, accumulated.String())
	}
	b.setReaction(chatID, messageID, "👍")
	return nil
}

// handleMessageUnary processes a chat request via unary gRPC call (fallback).
func (b *Bot) handleMessageUnary(ctx context.Context, chatID int64, messageID int, userID string, req *jikiv1.ChatRequest) {
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

	// Send file if the response contains file data (e.g., generated documents).
	if len(resp.FileData) > 0 {
		b.sendFile(chatID, resp.FileData, resp.FileName, resp.FileMime)
	}

	if resp.Content != "" {
		if err := b.SendMessage(chatID, resp.Content); err != nil {
			log.Error().Err(err).Str("user_id", userID).Msg("failed to send telegram reply")
		}
	}
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

func (b *Bot) handleStart(chatID int64) {
	text := "안녕하세요! 저는 지기(jiki)예요.\n" +
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
			"웹 앱의 설정 → 계정 탭에서 이 코드를 입력하세요.\n"+
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

	// Update persona in DB using JSONB merge (preserves existing keys like budget).
	if b.db != nil {
		dbCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
		defer cancel()

		_, err := b.db.ExecContext(dbCtx, `
			UPDATE profiles
			SET preferences = COALESCE(preferences, '{}'::jsonb) || $1::jsonb,
			    updated_at = NOW()
			WHERE uuid_id = $2
		`, fmt.Sprintf(`{"persona":"%s"}`, personaID), userID)
		if err != nil {
			log.Error().Err(err).Str("user_id", userID).Str("persona", personaID).Msg("failed to update persona")
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
