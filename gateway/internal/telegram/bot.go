package telegram

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"time"

	jikiv1 "github.com/jikime/jiki/gateway/gen/jiki/v1"
	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"
	"github.com/rs/zerolog/log"
	"google.golang.org/grpc"
)

// Bot wraps the Telegram bot API and forwards messages to the agent via gRPC.
type Bot struct {
	api        *tgbotapi.BotAPI
	grpcClient jikiv1.AgentServiceClient
}

// NewBot creates a new Telegram bot connected to the agent gRPC service.
func NewBot(token string, grpcConn *grpc.ClientConn) (*Bot, error) {
	api, err := tgbotapi.NewBotAPI(token)
	if err != nil {
		return nil, fmt.Errorf("telegram bot init: %w", err)
	}

	log.Info().Str("username", api.Self.UserName).Msg("Telegram bot authorised")

	return &Bot{
		api:        api,
		grpcClient: jikiv1.NewAgentServiceClient(grpcConn),
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
	userID := fmt.Sprintf("%d", msg.From.ID)
	chatID := msg.Chat.ID
	messageID := msg.MessageID

	// Handle /start command.
	if msg.IsCommand() && msg.Command() == "start" {
		b.handleStart(chatID)
		return
	}

	// Build the gRPC request from message content.
	chatReq := &jikiv1.ChatRequest{
		UserId:  userID,
		Message: msg.Text,
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

	// 1. Set 👀 reaction on the user's message to acknowledge receipt (openclaw pattern).
	b.setReaction(chatID, messageID, "👀")

	// 2. Start typing indicator loop (sendChatAction "typing" every 4s).
	//    Telegram typing status expires after ~5s, so we repeat it.
	typingCtx, typingCancel := context.WithCancel(ctx)
	go b.typingLoop(typingCtx, chatID)

	// 3. Call agent via gRPC.
	reqCtx, cancel := context.WithTimeout(ctx, 120*time.Second)
	defer cancel()

	resp, err := b.grpcClient.Chat(reqCtx, chatReq)

	// 4. Stop typing indicator.
	typingCancel()

	if err != nil {
		log.Error().Err(err).Str("user_id", userID).Msg("gRPC chat failed")
		// Set error reaction.
		b.setReaction(chatID, messageID, "😢")
		reply := tgbotapi.NewMessage(chatID, "잠시 서비스에 문제가 있어요. 잠시 후 다시 시도해 주세요.")
		b.api.Send(reply)
		return
	}

	// 5. Replace 👀 with ✅ to indicate completion.
	b.setReaction(chatID, messageID, "👍")

	// 6. Send the response.
	if err := b.SendMessage(chatID, resp.Content); err != nil {
		log.Error().Err(err).Str("user_id", userID).Msg("failed to send telegram reply")
	}
}

// typingLoop sends "typing" chat action every 4 seconds until ctx is cancelled.
// Telegram's typing indicator expires after ~5 seconds, so continuous refresh is needed.
// Inspired by openclaw's typing keepalive pattern with circuit breaker for 401 errors.
func (b *Bot) typingLoop(ctx context.Context, chatID int64) {
	// Send initial typing action immediately.
	action := tgbotapi.NewChatAction(chatID, tgbotapi.ChatTyping)
	if _, err := b.api.Send(action); err != nil {
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
			if _, err := b.api.Send(action); err != nil {
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

func (b *Bot) handleStart(chatID int64) {
	text := "안녕하세요! 저는 지기(jiki)예요.\n" +
		"가계부 기록, 지출 조회, 일상 기록 등을 도와드릴게요.\n" +
		"편하게 말씀해 주세요!"
	msg := tgbotapi.NewMessage(chatID, text)
	if _, err := b.api.Send(msg); err != nil {
		log.Error().Err(err).Int64("chat_id", chatID).Msg("failed to send /start reply")
	}
}
