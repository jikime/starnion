package cli

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/spf13/cobra"
	"golang.org/x/term"
	"gopkg.in/yaml.v3"
)

// UserConfig holds per-user CLI credentials.
// Stored at ~/.starnion/user.yaml (separate from server starnion.yaml).
// Any user can run 'starnion login' to populate this file.
type UserConfig struct {
	GatewayURL     string    `yaml:"gateway_url"`
	UserID         string    `yaml:"user_id"`
	Email          string    `yaml:"email"`
	Name           string    `yaml:"name"`
	Token          string    `yaml:"token"`
	TokenExpiresAt time.Time `yaml:"token_expires_at"`
}

// UserConfigPath returns ~/.starnion/user.yaml
func UserConfigPath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".starnion", "user.yaml")
}

// LoadUserConfig reads the user config file. Returns empty config if not found.
func LoadUserConfig() (UserConfig, error) {
	var cfg UserConfig
	data, err := os.ReadFile(UserConfigPath())
	if os.IsNotExist(err) {
		return cfg, nil
	}
	if err != nil {
		return cfg, fmt.Errorf("read user config: %w", err)
	}
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return cfg, fmt.Errorf("parse user config: %w", err)
	}
	return cfg, nil
}

// SaveUserConfig writes the user config to ~/.starnion/user.yaml (mode 0600).
func SaveUserConfig(cfg UserConfig) error {
	dir := ConfigDir()
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return fmt.Errorf("create config dir: %w", err)
	}
	data, err := yaml.Marshal(cfg)
	if err != nil {
		return fmt.Errorf("marshal user config: %w", err)
	}
	return os.WriteFile(UserConfigPath(), data, 0o600)
}

// ResolveGatewayURL returns the gateway URL for CLI use.
// Priority: UserConfig > StarNionConfig (admin) > default
func ResolveGatewayURL() string {
	if u, err := LoadUserConfig(); err == nil && u.GatewayURL != "" {
		return u.GatewayURL
	}
	if cfg, err := LoadConfig(); err == nil && cfg.Gateway.URL != "" {
		return cfg.Gateway.URL
	}
	return "http://localhost:8080"
}

// ResolveCLICredentials returns (gatewayURL, token, userID) for CLI use.
// Requires explicit login via 'starnion login' — no fallback to server config.
func ResolveCLICredentials() (gatewayURL, token, userID string, err error) {
	u, e := LoadUserConfig()
	if e != nil || u.Token == "" {
		return "", "", "", fmt.Errorf("로그인이 필요합니다. 'starnion login'을 실행하세요")
	}
	return u.GatewayURL, u.Token, u.UserID, nil
}

// ── commands ──────────────────────────────────────────────────────────────────

func newLoginCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "login",
		Short: "이메일/비밀번호로 로그인하여 CLI 토큰 발급",
		Long:  "StarNion 계정으로 로그인합니다.\n토큰은 ~/.starnion/user.yaml에 저장되며 30일간 유효합니다.",
		RunE: func(cmd *cobra.Command, args []string) error {
			return runLogin()
		},
	}
}

func newLogoutCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "logout",
		Short: "CLI 로그아웃 (로컬 토큰 삭제)",
		RunE: func(cmd *cobra.Command, args []string) error {
			return runLogout()
		},
	}
}

func newWhoAmICmd() *cobra.Command {
	return &cobra.Command{
		Use:   "whoami",
		Short: "현재 로그인된 계정 정보 출력",
		Run: func(cmd *cobra.Command, args []string) {
			runWhoAmI()
		},
	}
}

// ── login ─────────────────────────────────────────────────────────────────────

func runLogin() error {
	PrintSectionHeader(0, 0, "LOGIN")

	// Gateway URL
	gatewayURL := ResolveGatewayURL()
	fmt.Printf("  Gateway URL [%s]: ", gatewayURL)
	var input string
	fmt.Scanln(&input)
	input = strings.TrimSpace(input)
	if input != "" {
		gatewayURL = input
	}
	gatewayURL = strings.TrimRight(gatewayURL, "/")

	// Email
	fmt.Print("  이메일: ")
	var email string
	fmt.Scanln(&email)
	email = strings.TrimSpace(email)
	if email == "" {
		return fmt.Errorf("이메일을 입력해주세요")
	}

	// Password (hidden input)
	fmt.Print("  비밀번호: ")
	passwordBytes, err := term.ReadPassword(int(syscall.Stdin))
	fmt.Println()
	if err != nil {
		return fmt.Errorf("비밀번호 입력 실패: %w", err)
	}
	password := strings.TrimSpace(string(passwordBytes))
	if password == "" {
		return fmt.Errorf("비밀번호를 입력해주세요")
	}

	// Call gateway /auth/cli-token
	PrintInfo("로그인 중...")
	result, err := requestCLIToken(gatewayURL, email, password)
	if err != nil {
		return err
	}

	// Save to user config
	cfg := UserConfig{
		GatewayURL:     gatewayURL,
		UserID:         result.UserID,
		Email:          result.Email,
		Name:           result.Name,
		Token:          result.Token,
		TokenExpiresAt: result.ExpiresAt,
	}
	if err := SaveUserConfig(cfg); err != nil {
		return fmt.Errorf("토큰 저장 실패: %w", err)
	}

	fmt.Println()
	PrintOK("로그인", fmt.Sprintf("%s (%s)", result.Name, result.Email))
	PrintOK("토큰", fmt.Sprintf("저장 완료 (만료: %s)", result.ExpiresAt.Format("2006-01-02")))
	PrintHint("'starnion chat' 으로 대화를 시작하세요.")
	fmt.Println()
	return nil
}

// ── logout ────────────────────────────────────────────────────────────────────

func runLogout() error {
	PrintSectionHeader(0, 0, "LOGOUT")

	path := UserConfigPath()
	if _, err := os.Stat(path); os.IsNotExist(err) {
		PrintInfo("로그인 상태가 아닙니다.")
		return nil
	}

	if err := os.Remove(path); err != nil {
		return fmt.Errorf("로그아웃 실패: %w", err)
	}

	PrintOK("logout", "로컬 토큰이 삭제되었습니다.")
	fmt.Println()
	return nil
}

// ── whoami ────────────────────────────────────────────────────────────────────

func runWhoAmI() {
	PrintSectionHeader(0, 0, "WHOAMI")

	cfg, err := LoadUserConfig()
	if err != nil || cfg.Token == "" {
		PrintFail("whoami", "로그인 상태가 아닙니다.")
		PrintHint("'starnion login'으로 로그인하세요.")
		fmt.Println()
		return
	}

	daysLeft := int(time.Until(cfg.TokenExpiresAt).Hours() / 24)
	expStr := fmt.Sprintf("%s (%d일 남음)", cfg.TokenExpiresAt.Format("2006-01-02"), daysLeft)
	if daysLeft <= 0 {
		expStr = cfg.TokenExpiresAt.Format("2006-01-02") + " (만료됨)"
	}

	PrintOK("계정", fmt.Sprintf("%s (%s)", cfg.Name, cfg.Email))
	PrintOK("Gateway", cfg.GatewayURL)
	PrintOK("토큰 만료", expStr)
	fmt.Println()
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

type cliTokenResponse struct {
	Token     string    `json:"token"`
	UserID    string    `json:"user_id"`
	Email     string    `json:"email"`
	Name      string    `json:"name"`
	ExpiresAt time.Time `json:"expires_at"`
}

func requestCLIToken(gatewayURL, email, password string) (*cliTokenResponse, error) {
	body, _ := json.Marshal(map[string]string{
		"email":    email,
		"password": password,
	})

	req, err := http.NewRequest(http.MethodPost, gatewayURL+"/auth/cli-token", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("gateway 연결 실패: %w\n  URL을 확인하세요: %s", err, gatewayURL)
	}
	defer resp.Body.Close()

	switch resp.StatusCode {
	case http.StatusOK:
		// ok
	case http.StatusUnauthorized:
		return nil, fmt.Errorf("이메일 또는 비밀번호가 올바르지 않습니다")
	case http.StatusServiceUnavailable:
		return nil, fmt.Errorf("서버 데이터베이스를 사용할 수 없습니다")
	default:
		var errBody map[string]string
		json.NewDecoder(resp.Body).Decode(&errBody)
		return nil, fmt.Errorf("로그인 실패 (%s): %s", resp.Status, errBody["error"])
	}

	var result cliTokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("응답 파싱 실패: %w", err)
	}
	return &result, nil
}
