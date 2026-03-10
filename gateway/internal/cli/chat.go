package cli

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/spf13/cobra"
)

// newChatCmd returns the 'starnion chat' REPL command.
func newChatCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "chat",
		Short: "AI 어시스턴트와 대화 (대화형 REPL)",
		Long:  "StarNion AI 어시스턴트와 직접 대화합니다.\n'exit', 'quit', 또는 Ctrl+C로 종료.",
		RunE: func(cmd *cobra.Command, args []string) error {
			return runChat()
		},
	}
}


// ── chat REPL ─────────────────────────────────────────────────────────────────

func runChat() error {
	gatewayURL, token, userID, err := ResolveCLICredentials()
	if err != nil {
		PrintFail("인증", err.Error())
		return err
	}

	// Token expiry warning (user config only).
	if u, e := LoadUserConfig(); e == nil && !u.TokenExpiresAt.IsZero() {
		if time.Now().After(u.TokenExpiresAt) {
			PrintFail("토큰", "CLI 토큰이 만료되었습니다.")
			PrintHint("'starnion login'으로 다시 로그인하세요.")
			return fmt.Errorf("cli token expired")
		}
		if daysLeft := int(time.Until(u.TokenExpiresAt).Hours() / 24); daysLeft <= 7 {
			PrintWarn("토큰", fmt.Sprintf("CLI 토큰이 %d일 후 만료됩니다. 'starnion login'으로 갱신하세요.", daysLeft))
		}
	}

	PrintBanner(version)
	PrintSectionHeader(0, 0, "CHAT")
	PrintInfo("StarNion AI와 대화합니다.")
	PrintHint("종료: 'exit' 또는 Ctrl+C  |  Gateway: " + gatewayURL)
	fmt.Println()

	// Create a new conversation so messages are persisted and visible in web chat.
	threadID, err := createConversation(gatewayURL, token, userID)
	if err != nil {
		PrintWarn("대화", fmt.Sprintf("대화 세션 생성 실패 (메시지가 저장되지 않을 수 있음): %v", err))
	}

	scanner := bufio.NewScanner(os.Stdin)
	for {
		fmt.Print(sGold.Render("  ✦ ") + sBold.Render("You") + " › ")
		if !scanner.Scan() {
			// EOF (Ctrl+D)
			fmt.Println()
			PrintInfo("대화를 종료합니다.")
			break
		}
		input := strings.TrimSpace(scanner.Text())
		if input == "" {
			continue
		}
		if input == "exit" || input == "quit" || input == "q" {
			PrintInfo("대화를 종료합니다.")
			break
		}

		fmt.Print(sNebula.Render("  ★ ") + sBold.Render("StarNion") + " › ")
		if err := streamChat(gatewayURL, token, userID, threadID, input); err != nil {
			fmt.Println()
			PrintFail("오류", err.Error())
		}
		fmt.Println()
	}
	return nil
}

// createConversation calls POST /api/v1/conversations and returns the conversation ID (= thread_id).
func createConversation(gatewayURL, token, userID string) (string, error) {
	title := "CLI - " + time.Now().Format("2006-01-02 15:04")
	body, _ := json.Marshal(map[string]string{
		"user_id":  userID,
		"title":    title,
		"platform": "cli",
	})

	req, err := http.NewRequest(http.MethodPost, gatewayURL+"/api/v1/conversations", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("gateway 연결 실패: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("대화 생성 실패: %s", resp.Status)
	}

	var result struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("응답 파싱 실패: %w", err)
	}
	return result.ID, nil
}

// streamChat POSTs to the gateway SSE endpoint and prints text-delta events
// to stdout as they arrive, giving a real-time streaming feel.
func streamChat(gatewayURL, token, userID, threadID, message string) error {
	payload := map[string]string{
		"user_id": userID,
		"message": message,
	}
	if threadID != "" {
		payload["thread_id"] = threadID
	}
	body, _ := json.Marshal(payload)

	req, err := http.NewRequest(http.MethodPost, gatewayURL+"/api/v1/chat/stream", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "text/event-stream")
	req.Header.Set("Cache-Control", "no-cache")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("gateway 연결 실패: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized {
		return fmt.Errorf("인증 실패 — 'starnion auth refresh'로 토큰을 갱신하세요")
	}
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("gateway 오류: %s", resp.Status)
	}

	// Parse AI SDK v6 SSE stream.
	// Relevant events:
	//   {"type":"text-delta","id":"txt","delta":"..."}  — print immediately
	//   {"type":"error","errorText":"..."}              — return as error
	//   data: [DONE]                                    — stream finished
	reader := bufio.NewReader(resp.Body)
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			if err == io.EOF {
				break
			}
			return err
		}
		line = strings.TrimSpace(line)
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		data := strings.TrimPrefix(line, "data: ")
		if data == "[DONE]" {
			break
		}

		var event map[string]any
		if err := json.Unmarshal([]byte(data), &event); err != nil {
			continue
		}

		switch event["type"] {
		case "text-delta":
			if delta, ok := event["delta"].(string); ok {
				fmt.Print(delta)
			}
		case "error":
			if errText, ok := event["errorText"].(string); ok {
				return fmt.Errorf("%s", errText)
			}
		}
	}
	return nil
}

