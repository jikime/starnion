package telegram

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"strings"
	"time"
)

// Update represents a single Telegram update from getUpdates.
type Update struct {
	UpdateID int64    `json:"update_id"`
	Message  *Message `json:"message"`
}

// Message represents an incoming Telegram message.
type Message struct {
	MessageID    int64       `json:"message_id"`
	From         *User       `json:"from"`
	Chat         *Chat       `json:"chat"`
	Text         string      `json:"text"`
	Photo        []PhotoSize `json:"photo"`
	Voice        *Voice      `json:"voice"`
	Document     *Document   `json:"document"`
	Caption      string      `json:"caption"`
	MediaGroupID string      `json:"media_group_id"`
}

// Document represents a file attachment.
type Document struct {
	FileID   string `json:"file_id"`
	FileName string `json:"file_name"`
	MimeType string `json:"mime_type"`
	FileSize int    `json:"file_size"`
}

// PhotoSize represents a photo attachment.
type PhotoSize struct {
	FileID   string `json:"file_id"`
	Width    int    `json:"width"`
	Height   int    `json:"height"`
	FileSize int    `json:"file_size"`
}

// Voice represents a voice message.
type Voice struct {
	FileID   string `json:"file_id"`
	Duration int    `json:"duration"`
	MimeType string `json:"mime_type"`
}

// User represents a Telegram user.
type User struct {
	ID        int64  `json:"id"`
	Username  string `json:"username"`
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
}

// Chat represents a Telegram chat.
type Chat struct {
	ID   int64  `json:"id"`
	Type string `json:"type"`
}

const apiBase = "https://api.telegram.org/bot"

// APIError is returned when the Telegram Bot API responds with "ok": false.
type APIError struct {
	Code        int
	Description string
}

func (e *APIError) Error() string {
	return fmt.Sprintf("telegram api error: code=%d description=%q", e.Code, e.Description)
}

// IsPermanentError reports whether err is a Telegram API error that will
// never succeed on retry (401 Unauthorized, 404 Not Found).
func IsPermanentError(err error) bool {
	var apiErr *APIError
	if errors.As(err, &apiErr) {
		return apiErr.Code == 401 || apiErr.Code == 404
	}
	return false
}

// Client is a minimal Telegram Bot API client.
type Client struct {
	token          string
	httpClient     *http.Client
	longPollClient *http.Client // separate client with longer timeout for getUpdates
}

func NewClient(token string) *Client {
	// Shared transport enables TCP connection reuse across all Telegram API calls.
	transport := &http.Transport{
		MaxIdleConns:        10,
		MaxIdleConnsPerHost: 10,
		IdleConnTimeout:     90 * time.Second,
	}
	return &Client{
		token:          token,
		httpClient:     &http.Client{Timeout: 30 * time.Second, Transport: transport},
		longPollClient: &http.Client{Timeout: 60 * time.Second, Transport: transport},
	}
}

// redactErr returns a new error with the bot token replaced by "[token]".
// Use this when wrapping HTTP errors that may contain the API URL.
func (c *Client) redactErr(err error) error {
	if err == nil {
		return nil
	}
	return fmt.Errorf("%s", strings.ReplaceAll(err.Error(), c.token, "[token]"))
}

type sendMessagePayload struct {
	ChatID    int64  `json:"chat_id"`
	Text      string `json:"text"`
	ParseMode string `json:"parse_mode,omitempty"`
}

// SendMessage sends a text message to a Telegram chat.
func (c *Client) SendMessage(chatID int64, text string) error {
	payload := sendMessagePayload{
		ChatID: chatID,
		Text:   text,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	url := fmt.Sprintf("%s%s/sendMessage", apiBase, c.token)
	resp, err := c.httpClient.Post(url, "application/json", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("telegram sendMessage: %w", c.redactErr(err))
	}
	defer func() { _, _ = io.Copy(io.Discard, resp.Body); resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("telegram sendMessage: status %d", resp.StatusCode)
	}
	return nil
}

// SendMessageHTML sends a message with HTML parse_mode.
// Falls back to plain SendMessage if HTML send fails.
func (c *Client) SendMessageHTML(chatID int64, text string) error {
	payload := sendMessagePayload{
		ChatID:    chatID,
		Text:      text,
		ParseMode: "HTML",
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	url := fmt.Sprintf("%s%s/sendMessage", apiBase, c.token)
	resp, err := c.httpClient.Post(url, "application/json", bytes.NewReader(body))
	if err != nil {
		// fallback to plain
		return c.SendMessage(chatID, text)
	}
	defer func() { _, _ = io.Copy(io.Discard, resp.Body); resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		// fallback to plain
		return c.SendMessage(chatID, text)
	}
	return nil
}

// SendMessageGetID sends a message and returns the Telegram message_id.
// parseMode can be "" or "HTML".
func (c *Client) SendMessageGetID(chatID int64, text, parseMode string) (int64, error) {
	payload := sendMessagePayload{
		ChatID:    chatID,
		Text:      text,
		ParseMode: parseMode,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return 0, err
	}

	url := fmt.Sprintf("%s%s/sendMessage", apiBase, c.token)
	resp, err := c.httpClient.Post(url, "application/json", bytes.NewReader(body))
	if err != nil {
		return 0, fmt.Errorf("telegram sendMessage: %w", c.redactErr(err))
	}
	defer func() { _, _ = io.Copy(io.Discard, resp.Body); resp.Body.Close() }()

	var result struct {
		OK     bool `json:"ok"`
		Result struct {
			MessageID int64 `json:"message_id"`
		} `json:"result"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return 0, fmt.Errorf("telegram sendMessage decode: %w", err)
	}
	if !result.OK {
		return 0, fmt.Errorf("telegram sendMessage: not ok")
	}
	return result.Result.MessageID, nil
}

// EditMessage edits an existing message text.
func (c *Client) EditMessage(chatID, msgID int64, text, parseMode string) error {
	payload := map[string]any{
		"chat_id":    chatID,
		"message_id": msgID,
		"text":       text,
	}
	if parseMode != "" {
		payload["parse_mode"] = parseMode
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	url := fmt.Sprintf("%s%s/editMessageText", apiBase, c.token)
	resp, err := c.httpClient.Post(url, "application/json", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("telegram editMessageText: %w", c.redactErr(err))
	}
	defer func() { _, _ = io.Copy(io.Discard, resp.Body); resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("telegram editMessageText: status %d", resp.StatusCode)
	}
	return nil
}

// GetMe calls getMe API and returns the bot username.
func (c *Client) GetMe() (string, error) {
	url := fmt.Sprintf("%s%s/getMe", apiBase, c.token)
	resp, err := c.httpClient.Get(url)
	if err != nil {
		return "", fmt.Errorf("telegram getMe: %w", c.redactErr(err))
	}
	defer func() { _, _ = io.Copy(io.Discard, resp.Body); resp.Body.Close() }()

	var result struct {
		OK     bool `json:"ok"`
		Result struct {
			Username string `json:"username"`
		} `json:"result"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("telegram getMe decode: %w", err)
	}
	if !result.OK {
		return "", fmt.Errorf("telegram getMe: not ok")
	}
	return result.Result.Username, nil
}

// GetFileURL calls getFile API and returns the full download URL for a file.
// NOTE: The returned URL contains the bot token (format: .../bot<token>/...).
// Do NOT log or persist this URL — use it only for a single download and discard.
func (c *Client) GetFileURL(fileID string) (string, error) {
	url := fmt.Sprintf("%s%s/getFile?file_id=%s", apiBase, c.token, fileID)
	resp, err := c.httpClient.Get(url)
	if err != nil {
		return "", fmt.Errorf("telegram getFile: %w", c.redactErr(err))
	}
	defer func() { _, _ = io.Copy(io.Discard, resp.Body); resp.Body.Close() }()

	var result struct {
		OK     bool `json:"ok"`
		Result struct {
			FilePath string `json:"file_path"`
		} `json:"result"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("telegram getFile decode: %w", err)
	}
	if !result.OK || result.Result.FilePath == "" {
		return "", fmt.Errorf("telegram getFile: not ok or empty path")
	}
	return fmt.Sprintf("https://api.telegram.org/file/bot%s/%s", c.token, result.Result.FilePath), nil
}

// GetUpdates fetches new updates via long polling. offset is the update_id of the last processed update + 1.
func (c *Client) GetUpdates(offset int64, timeout int) ([]Update, error) {
	url := fmt.Sprintf("%s%s/getUpdates?offset=%d&timeout=%d", apiBase, c.token, offset, timeout)
	resp, err := c.longPollClient.Get(url)
	if err != nil {
		return nil, fmt.Errorf("telegram getUpdates: %w", c.redactErr(err))
	}
	defer func() { _, _ = io.Copy(io.Discard, resp.Body); resp.Body.Close() }()

	var result struct {
		OK          bool     `json:"ok"`
		ErrorCode   int      `json:"error_code"`
		Description string   `json:"description"`
		Result      []Update `json:"result"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("telegram getUpdates decode: %w", err)
	}
	if !result.OK {
		return nil, &APIError{Code: result.ErrorCode, Description: result.Description}
	}
	return result.Result, nil
}

// DeleteWebhook removes any registered webhook so polling can work.
func (c *Client) DeleteWebhook() error {
	url := fmt.Sprintf("%s%s/deleteWebhook", apiBase, c.token)
	resp, err := c.httpClient.Get(url)
	if err != nil {
		return fmt.Errorf("telegram deleteWebhook: %w", err)
	}
	defer func() { _, _ = io.Copy(io.Discard, resp.Body); resp.Body.Close() }()
	return nil
}

// SendPhoto uploads image bytes to a Telegram chat via multipart form.
// caption is optional; pass "" to omit.
func (c *Client) SendPhoto(chatID int64, data []byte, filename, caption string) error {
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)

	_ = w.WriteField("chat_id", fmt.Sprintf("%d", chatID))
	if caption != "" {
		_ = w.WriteField("caption", caption)
		_ = w.WriteField("parse_mode", "HTML")
	}

	part, err := w.CreateFormFile("photo", filename)
	if err != nil {
		return fmt.Errorf("sendPhoto createFormFile: %w", err)
	}
	if _, err := io.Copy(part, bytes.NewReader(data)); err != nil {
		return fmt.Errorf("sendPhoto write: %w", err)
	}
	w.Close()

	url := fmt.Sprintf("%s%s/sendPhoto", apiBase, c.token)
	resp, err := c.httpClient.Post(url, w.FormDataContentType(), &buf)
	if err != nil {
		return fmt.Errorf("telegram sendPhoto: %w", err)
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("telegram sendPhoto: status %d: %s", resp.StatusCode, b)
	}
	// Telegram may return HTTP 200 with {"ok":false,...} for API-level errors.
	var apiResp struct {
		OK          bool   `json:"ok"`
		Description string `json:"description"`
	}
	if err := json.Unmarshal(b, &apiResp); err == nil && !apiResp.OK {
		return fmt.Errorf("telegram sendPhoto: %s", apiResp.Description)
	}
	return nil
}

// SendAudio uploads audio bytes as a Telegram audio message.
// caption is optional; pass "" to omit.
func (c *Client) SendAudio(chatID int64, data []byte, filename, caption string) error {
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)

	_ = w.WriteField("chat_id", fmt.Sprintf("%d", chatID))
	if caption != "" {
		_ = w.WriteField("caption", caption)
	}

	part, err := w.CreateFormFile("audio", filename)
	if err != nil {
		return fmt.Errorf("sendAudio createFormFile: %w", err)
	}
	if _, err := io.Copy(part, bytes.NewReader(data)); err != nil {
		return fmt.Errorf("sendAudio write: %w", err)
	}
	w.Close()

	url := fmt.Sprintf("%s%s/sendAudio", apiBase, c.token)
	resp, err := c.httpClient.Post(url, w.FormDataContentType(), &buf)
	if err != nil {
		return fmt.Errorf("telegram sendAudio: %w", err)
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("telegram sendAudio: status %d: %s", resp.StatusCode, b)
	}
	var apiResp struct {
		OK          bool   `json:"ok"`
		Description string `json:"description"`
	}
	if err := json.Unmarshal(b, &apiResp); err == nil && !apiResp.OK {
		return fmt.Errorf("telegram sendAudio: %s", apiResp.Description)
	}
	return nil
}

// SendDocument uploads file bytes as a Telegram document (any file type).
// caption is optional; pass "" to omit.
func (c *Client) SendDocument(chatID int64, data []byte, filename, caption string) error {
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)

	_ = w.WriteField("chat_id", fmt.Sprintf("%d", chatID))
	if caption != "" {
		_ = w.WriteField("caption", caption)
	}

	part, err := w.CreateFormFile("document", filename)
	if err != nil {
		return fmt.Errorf("sendDocument createFormFile: %w", err)
	}
	if _, err := io.Copy(part, bytes.NewReader(data)); err != nil {
		return fmt.Errorf("sendDocument write: %w", err)
	}
	w.Close()

	url := fmt.Sprintf("%s%s/sendDocument", apiBase, c.token)
	resp, err := c.httpClient.Post(url, w.FormDataContentType(), &buf)
	if err != nil {
		return fmt.Errorf("telegram sendDocument: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("telegram sendDocument: status %d: %s", resp.StatusCode, b)
	}
	return nil
}

// SendChatAction sends a chat action (e.g. "typing") to show activity indicator.
func (c *Client) SendChatAction(chatID int64, action string) error {
	payload := map[string]any{"chat_id": chatID, "action": action}
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	url := fmt.Sprintf("%s%s/sendChatAction", apiBase, c.token)
	resp, err := c.httpClient.Post(url, "application/json", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("telegram sendChatAction: %w", err)
	}
	defer func() { _, _ = io.Copy(io.Discard, resp.Body); resp.Body.Close() }()
	return nil
}

// SetReaction sets an emoji reaction on a specific message.
// Uses setMessageReaction API (Bot API 7.0+).
func (c *Client) SetReaction(chatID int64, messageID int, emoji string) error {
	payload := map[string]any{
		"chat_id":    chatID,
		"message_id": messageID,
		"reaction":   []map[string]string{{"type": "emoji", "emoji": emoji}},
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	url := fmt.Sprintf("%s%s/setMessageReaction", apiBase, c.token)
	resp, err := c.httpClient.Post(url, "application/json", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("telegram setMessageReaction: %w", err)
	}
	defer func() { _, _ = io.Copy(io.Discard, resp.Body); resp.Body.Close() }()
	return nil
}

// SetWebhook registers a webhook URL with Telegram.
func (c *Client) SetWebhook(webhookURL string) error {
	payload := map[string]string{"url": webhookURL}
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	url := fmt.Sprintf("%s%s/setWebhook", apiBase, c.token)
	resp, err := c.httpClient.Post(url, "application/json", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("telegram setWebhook: %w", err)
	}
	defer func() { _, _ = io.Copy(io.Discard, resp.Body); resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("telegram setWebhook: status %d", resp.StatusCode)
	}
	return nil
}

// MarkdownToHTML converts a subset of Markdown to Telegram HTML (exported).
func MarkdownToHTML(text string) string {
	return markdownToHTML(text)
}

// markdownToHTML converts a subset of Markdown to Telegram HTML.
// Handles: ```code blocks```, `inline code`, **bold**, *italic*.
// Escapes remaining HTML-special characters.
func markdownToHTML(text string) string {
	var out strings.Builder
	i := 0
	n := len(text)

	for i < n {
		// ── triple-backtick code block ──────────────────────────────────────
		if i+2 < n && text[i] == '`' && text[i+1] == '`' && text[i+2] == '`' {
			// find closing ```
			end := strings.Index(text[i+3:], "```")
			if end >= 0 {
				content := text[i+3 : i+3+end]
				// strip optional language hint on first line
				if nl := strings.Index(content, "\n"); nl >= 0 {
					content = content[nl+1:]
				}
				out.WriteString("<pre><code>")
				out.WriteString(htmlEscape(content))
				out.WriteString("</code></pre>")
				i = i + 3 + end + 3
				continue
			}
		}

		// ── inline backtick ─────────────────────────────────────────────────
		if text[i] == '`' {
			end := strings.Index(text[i+1:], "`")
			if end >= 0 {
				content := text[i+1 : i+1+end]
				out.WriteString("<code>")
				out.WriteString(htmlEscape(content))
				out.WriteString("</code>")
				i = i + 1 + end + 1
				continue
			}
		}

		// ── bold **…** ──────────────────────────────────────────────────────
		if i+1 < n && text[i] == '*' && text[i+1] == '*' {
			end := strings.Index(text[i+2:], "**")
			if end >= 0 {
				content := text[i+2 : i+2+end]
				out.WriteString("<b>")
				out.WriteString(htmlEscape(content))
				out.WriteString("</b>")
				i = i + 2 + end + 2
				continue
			}
		}

		// ── italic *…* ──────────────────────────────────────────────────────
		if text[i] == '*' {
			end := strings.Index(text[i+1:], "*")
			if end >= 0 {
				content := text[i+1 : i+1+end]
				out.WriteString("<i>")
				out.WriteString(htmlEscape(content))
				out.WriteString("</i>")
				i = i + 1 + end + 1
				continue
			}
		}

		// ── plain character — escape HTML specials ───────────────────────────
		switch text[i] {
		case '<':
			out.WriteString("&lt;")
		case '>':
			out.WriteString("&gt;")
		case '&':
			out.WriteString("&amp;")
		default:
			out.WriteByte(text[i])
		}
		i++
	}

	return out.String()
}

// htmlEscape escapes <, > and & characters for use inside HTML tags.
func htmlEscape(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	return s
}
