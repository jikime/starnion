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

// newAuthCmd returns the 'starnion auth' command group.
func newAuthCmd() *cobra.Command {
	c := &cobra.Command{
		Use:   "auth",
		Short: "CLI 인증 관리",
	}
	c.AddCommand(newAuthRefreshCmd())
	return c
}

func newAuthRefreshCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "refresh",
		Short: "CLI 토큰 갱신 (30일 연장)",
		RunE: func(cmd *cobra.Command, args []string) error {
			return runAuthRefresh()
		},
	}
}

// ── chat REPL ─────────────────────────────────────────────────────────────────

func runChat() error {
	cfg, err := LoadConfig()
	if err != nil {
		return fmt.Errorf("설정 파일 로드 실패: %w", err)
	}

	// Validate CLI credentials
	if cfg.CLI.UserID == "" || cfg.CLI.Token == "" {
		PrintFail("CLI", "CLI 인증 정보가 없습니다.")
		PrintHint("'starnion setup'을 먼저 실행하거나 'starnion auth refresh'로 토큰을 발급하세요.")
		return fmt.Errorf("cli credentials not configured")
	}

	// Token expiry checks
	if !cfg.CLI.TokenExpiresAt.IsZero() {
		if time.Now().After(cfg.CLI.TokenExpiresAt) {
			PrintFail("토큰", "CLI 토큰이 만료되었습니다.")
			PrintHint("'starnion auth refresh'로 토큰을 갱신하세요.")
			return fmt.Errorf("cli token expired")
		}
		daysLeft := int(time.Until(cfg.CLI.TokenExpiresAt).Hours() / 24)
		if daysLeft <= 7 {
			PrintWarn("토큰", fmt.Sprintf("CLI 토큰이 %d일 후 만료됩니다. 곧 'starnion auth refresh'를 실행하세요.", daysLeft))
		}
	}

	gatewayURL := cfg.Gateway.URL
	if gatewayURL == "" {
		gatewayURL = "http://localhost:8080"
	}

	PrintBanner(version)
	PrintSectionHeader(0, 0, "CHAT")
	PrintInfo("StarNion AI와 대화합니다.")
	PrintHint("종료: 'exit' 또는 Ctrl+C  |  Gateway: " + gatewayURL)
	fmt.Println()

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
		if err := streamChat(gatewayURL, cfg.CLI.Token, cfg.CLI.UserID, input); err != nil {
			fmt.Println()
			PrintFail("오류", err.Error())
		}
		fmt.Println()
	}
	return nil
}

// streamChat POSTs to the gateway SSE endpoint and prints text-delta events
// to stdout as they arrive, giving a real-time streaming feel.
func streamChat(gatewayURL, token, userID, message string) error {
	body, _ := json.Marshal(map[string]string{
		"user_id": userID,
		"message": message,
	})

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

// ── auth refresh ──────────────────────────────────────────────────────────────

func runAuthRefresh() error {
	PrintSectionHeader(0, 0, "AUTH REFRESH")

	cfg, err := LoadConfig()
	if err != nil {
		return fmt.Errorf("설정 파일 로드 실패: %w", err)
	}

	if cfg.CLI.UserID == "" {
		PrintFail("auth", "CLI user_id가 없습니다. 'starnion setup'을 먼저 실행하세요.")
		return fmt.Errorf("not configured")
	}
	if cfg.Auth.JWTSecret == "" {
		PrintFail("auth", "JWT secret이 없습니다. 'starnion setup'을 먼저 실행하세요.")
		return fmt.Errorf("jwt secret missing")
	}

	token, expiresAt, err := IssueCLIToken(cfg.CLI.UserID, cfg.Auth.JWTSecret)
	if err != nil {
		return fmt.Errorf("토큰 발급 실패: %w", err)
	}

	cfg.CLI.Token = token
	cfg.CLI.TokenExpiresAt = expiresAt

	if err := SaveConfig(cfg); err != nil {
		return fmt.Errorf("설정 저장 실패: %w", err)
	}

	PrintOK("auth", fmt.Sprintf("CLI 토큰 갱신 완료 (만료: %s)", expiresAt.Format("2006-01-02")))
	PrintInfo("user_id: " + cfg.CLI.UserID)
	fmt.Println()
	return nil
}
