package cli

import (
	"context"
	"embed"
	"fmt"
	"io/fs"
	"net"
	"net/http"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/charmbracelet/huh"
	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"
)

// migrations embeds all SQL files in the migrations subdirectory.
//
//go:embed migrations
var migrationFS embed.FS

// RunSetup executes the interactive 9-step setup wizard.
func RunSetup() error {
	PrintBanner("1.0.0")

	// ── Detect existing config ────────────────────────────────────────────────
	if ConfigExists() {
		var overwrite bool
		_ = huh.NewForm(huh.NewGroup(
			huh.NewConfirm().
				Title("기존 설정 파일이 있습니다. 덮어쓰겠습니까?").
				Value(&overwrite),
		)).Run()
		if !overwrite {
			PrintInfo("설정을 유지합니다. 취소됩니다.")
			return nil
		}
	}

	cfg := DefaultConfig()

	// ════════════════════════════════════════════════════════════════════════════
	// [1/9] LANGUAGE
	// ════════════════════════════════════════════════════════════════════════════
	PrintSectionHeader(1, 7, "LANGUAGE")

	adminLanguage := "en"
	if err := huh.NewForm(huh.NewGroup(
		huh.NewSelect[string]().
			Title("Language / 언어 / 言語 / 语言").
			Description("관리자 계정의 기본 언어를 선택하세요.").
			Options(
				huh.NewOption("English (default)", "en"),
				huh.NewOption("한국어", "ko"),
				huh.NewOption("日本語", "ja"),
				huh.NewOption("中文", "zh"),
			).
			Value(&adminLanguage),
	)).Run(); err != nil {
		return fmt.Errorf("setup cancelled: %w", err)
	}
	PrintOK("Language", adminLanguage)

	// ════════════════════════════════════════════════════════════════════════════
	// [2/9] SYSTEM CHECK
	// ════════════════════════════════════════════════════════════════════════════
	PrintSectionHeader(2, 7, "SYSTEM CHECK")
	runSystemCheck()

	// ════════════════════════════════════════════════════════════════════════════
	// [3/9] DATABASE
	// ════════════════════════════════════════════════════════════════════════════
	PrintSectionHeader(3, 7, "DATABASE")
	PrintInfo("PostgreSQL 접속 정보를 입력해주세요.")
	fmt.Println()

	dbPort := strconv.Itoa(cfg.Database.Port)
	if err := huh.NewForm(huh.NewGroup(
		huh.NewInput().
			Title("Host").
			Placeholder("localhost").
			Value(&cfg.Database.Host),
		huh.NewInput().
			Title("Port").
			Placeholder("5432").
			Value(&dbPort),
		huh.NewInput().
			Title("Database Name").
			Placeholder("starnion").
			Value(&cfg.Database.Name),
		huh.NewInput().
			Title("User").
			Placeholder("postgres").
			Value(&cfg.Database.User),
		huh.NewInput().
			Title("Password").
			EchoMode(huh.EchoModePassword).
			Value(&cfg.Database.Password),
	)).Run(); err != nil {
		return fmt.Errorf("database setup cancelled: %w", err)
	}

	if p, err := strconv.Atoi(dbPort); err == nil && p > 0 {
		cfg.Database.Port = p
	}
	applyDBDefaults(&cfg)

	// Wait for PostgreSQL to be reachable.
	checkPostgresWithWait(cfg.Database.Host, cfg.Database.Port)

	// Connect and run migrations.
	if err := connectAndMigrate(cfg); err != nil {
		PrintFail("Database", err.Error())
		return err
	}
	PrintOK("Database", "연결 성공 및 마이그레이션 완료")

	// ════════════════════════════════════════════════════════════════════════════
	// [4/9] ADMIN ACCOUNT
	// ════════════════════════════════════════════════════════════════════════════
	PrintSectionHeader(4, 7, "ADMIN ACCOUNT")
	PrintInfo("첫 번째 관리자 계정을 생성합니다.")
	fmt.Println()

	var adminName, adminEmail, adminPassword, adminPasswordConfirm string
	for {
		if err := huh.NewForm(huh.NewGroup(
			huh.NewInput().
				Title("이름").
				Placeholder("홍길동").
				Value(&adminName).
				Validate(func(s string) error {
					if strings.TrimSpace(s) == "" {
						return fmt.Errorf("이름을 입력하세요")
					}
					return nil
				}),
			huh.NewInput().
				Title("이메일").
				Placeholder("admin@example.com").
				Value(&adminEmail).
				Validate(func(s string) error {
					if !strings.Contains(s, "@") {
						return fmt.Errorf("올바른 이메일 주소를 입력하세요")
					}
					return nil
				}),
			huh.NewInput().
				Title("비밀번호").
				EchoMode(huh.EchoModePassword).
				Value(&adminPassword).
				Validate(func(s string) error {
					if len(s) < 8 {
						return fmt.Errorf("비밀번호는 8자 이상이어야 합니다")
					}
					return nil
				}),
			huh.NewInput().
				Title("비밀번호 확인").
				EchoMode(huh.EchoModePassword).
				Value(&adminPasswordConfirm),
		)).Run(); err != nil {
			return fmt.Errorf("admin setup cancelled: %w", err)
		}

		if adminPassword != adminPasswordConfirm {
			PrintFail("비밀번호", "비밀번호가 일치하지 않습니다. 다시 입력해주세요.")
			fmt.Println()
			adminPassword = ""
			adminPasswordConfirm = ""
			continue
		}
		break
	}

	if _, err := createAdminUser(cfg, adminName, adminEmail, adminPassword, adminLanguage); err != nil {
		PrintFail("Admin", err.Error())
		return err
	}
	cfg.Admin.Email = adminEmail
	PrintOK("Admin", adminName+" ("+adminEmail+") 계정 생성 완료")

	// ════════════════════════════════════════════════════════════════════════════
	// [5/9] MINIO (FILE STORAGE)
	// ════════════════════════════════════════════════════════════════════════════
	PrintSectionHeader(5, 7, "FILE STORAGE (MinIO)")
	PrintInfo("이미지 및 파일 저장소 정보를 입력해주세요.")
	fmt.Println()

	if err := huh.NewForm(huh.NewGroup(
		huh.NewInput().
			Title("Public URL").
			Description("파일을 외부에서 접근할 URL (Endpoint는 자동 설정됩니다)").
			Placeholder("http://localhost:9000").
			Value(&cfg.Minio.PublicURL),
		huh.NewInput().
			Title("Access Key").
			Placeholder("minioadmin").
			Value(&cfg.Minio.AccessKey),
		huh.NewInput().
			Title("Secret Key").
			EchoMode(huh.EchoModePassword).
			Value(&cfg.Minio.SecretKey),
		huh.NewInput().
			Title("Bucket").
			Placeholder("starnion-files").
			Value(&cfg.Minio.Bucket),
	)).Run(); err != nil {
		return fmt.Errorf("minio setup cancelled: %w", err)
	}

	if cfg.Minio.PublicURL == "" {
		cfg.Minio.PublicURL = "http://localhost:9000"
	}
	if cfg.Minio.Bucket == "" {
		cfg.Minio.Bucket = "starnion-files"
	}
	cfg.Minio.DeriveEndpoint()

	if checkMinIO(cfg.Minio.PublicURL) {
		PrintOK("MinIO", "연결 확인")
	} else {
		PrintWarn("MinIO", "연결 실패 — 설정은 저장되지만 서비스 시작 전 MinIO를 실행하세요")
	}

	// ════════════════════════════════════════════════════════════════════════════
	// [6/9] SERVICE CONFIGURATION
	// ════════════════════════════════════════════════════════════════════════════
	PrintSectionHeader(6, 7, "SERVICE CONFIGURATION")
	PrintInfo("서비스 포트와 공개 URL을 설정합니다.")
	PrintInfo("도메인이 있으면 Web Public URL에 입력하세요 (예: https://starnion.example.com).")
	PrintInfo("로컬에서만 사용하면 비워두세요.")
	fmt.Println()

	gwPortStr := strconv.Itoa(cfg.Gateway.Port)
	grpcPortStr := strconv.Itoa(cfg.Gateway.GRPCPort)
	webPublicURL := cfg.UI.PublicURL
	if err := huh.NewForm(huh.NewGroup(
		huh.NewInput().
			Title("Gateway HTTP Port").
			Placeholder("8080").
			Value(&gwPortStr),
		huh.NewInput().
			Title("Gateway gRPC Port").
			Placeholder("50051").
			Value(&grpcPortStr),
		huh.NewInput().
			Title("Web Public URL (선택)").
			Description("도메인이 있으면 입력, 없으면 비워두세요 (http://localhost:3893 사용)").
			Placeholder("https://starnion.example.com").
			Value(&webPublicURL),
	)).Run(); err != nil {
		return fmt.Errorf("service config cancelled: %w", err)
	}

	if p, err := strconv.Atoi(gwPortStr); err == nil && p > 0 {
		cfg.Gateway.Port = p
	}
	if p, err := strconv.Atoi(grpcPortStr); err == nil && p > 0 {
		cfg.Gateway.GRPCPort = p
	}
	cfg.UI.PublicURL = strings.TrimSpace(webPublicURL)
	cfg.Gateway.AllowedOrigins = cfg.UI.UIURL()
	PrintOK("Gateway", fmt.Sprintf("HTTP :%d  gRPC :%d", cfg.Gateway.Port, cfg.Gateway.GRPCPort))
	if cfg.UI.PublicURL != "" {
		PrintOK("Web URL", cfg.UI.PublicURL)
	}

	// ════════════════════════════════════════════════════════════════════════════
	// [7/7] AI PROVIDER
	// ════════════════════════════════════════════════════════════════════════════
	PrintSectionHeader(7, 7, "AI PROVIDER")
	PrintInfo("AI 프로바이더 설정 상태를 확인합니다.")
	fmt.Println()

	claudeCredPath := os.ExpandEnv("$HOME/.claude/.credentials.json")
	if _, err := os.Stat(claudeCredPath); err == nil {
		PrintOK("Claude Code", "인증 확인됨")
		PrintInfo("→ 기본 AI 모델로 Claude (claude-sonnet-4-5) 를 사용합니다.")
	} else {
		PrintWarn("Claude Code", "인증이 감지되지 않았습니다.")
		fmt.Println()
		PrintInfo("AI를 사용하려면 아래 중 하나를 설정하세요:")
		fmt.Println()
		fmt.Printf("  %s Claude Code 구독 (권장)\n", sGold.Render("•"))
		fmt.Printf("    터미널에서 %s 실행 → %s 명령으로 인증\n", sGold.Render("claude"), sGold.Render("/login"))
		fmt.Println()
		fmt.Printf("  %s 다른 AI 프로바이더 (Gemini, OpenAI, Ollama 등)\n", sGold.Render("•"))
		fmt.Printf("    웹 로그인 후 %s 에서 API 키 등록\n", sGold.Render("Settings → Models"))
	}
	fmt.Println()
	PrintInfo("프로바이더 및 모델 변경은 로그인 후 Settings → Models 에서 설정할 수 있습니다.")

	// ════════════════════════════════════════════════════════════════════════════
	// EMBEDDING ENGINE (선택)
	// ════════════════════════════════════════════════════════════════════════════
	PrintSectionHeader(0, 0, "EMBEDDING ENGINE (선택)")
	PrintInfo("검색 기록·문서 벡터 저장에 사용되는 서버 공용 임베딩 엔진입니다.")
	PrintInfo("⚠  모든 사용자가 동일한 모델을 공유합니다. 설정 후 변경 시 DB 재색인 필요.")
	PrintInfo("건너뛰려면 '건너뜀'을 선택하세요. 나중에 설정: starnion config embedding")
	fmt.Println()

	var embeddingProvider string
	if err := huh.NewForm(huh.NewGroup(
		huh.NewSelect[string]().
			Title("임베딩 프로바이더").
			Description("OpenAI 권장 (text-embedding-3-small)").
			Options(
				huh.NewOption("OpenAI — text-embedding-3-small (권장, $0.02/1M tokens)", "openai"),
				huh.NewOption("Gemini — gemini-embedding-001 (무료 1,500 req/일)", "gemini"),
				huh.NewOption("건너뜀", "skip"),
			).
			Value(&embeddingProvider),
	)).Run(); err != nil {
		return fmt.Errorf("embedding setup cancelled: %w", err)
	}

	if embeddingProvider != "skip" {
		keyPlaceholder := map[string]string{
			"openai": "sk-...",
			"gemini": "AIzaSy...",
		}[embeddingProvider]

		var embeddingAPIKey string
		if err := huh.NewForm(huh.NewGroup(
			huh.NewInput().
				Title("API Key").
				EchoMode(huh.EchoModePassword).
				Placeholder(keyPlaceholder).
				Value(&embeddingAPIKey),
		)).Run(); err != nil {
			return fmt.Errorf("embedding api key cancelled: %w", err)
		}

		if embeddingAPIKey != "" {
			cfg.Embedding.Provider = embeddingProvider
			cfg.Embedding.APIKey = embeddingAPIKey
			cfg.Embedding.Dimensions = 768
			if embeddingProvider == "openai" {
				cfg.Embedding.Model = "text-embedding-3-small"
			} else {
				cfg.Embedding.Model = "gemini-embedding-001"
			}
			PrintOK("Embedding", fmt.Sprintf("%s / %s (%d dims)",
				embeddingProvider, cfg.Embedding.Model, cfg.Embedding.Dimensions))
		} else {
			PrintWarn("Embedding", "API Key 없음 — 건너뜁니다")
		}
	} else {
		PrintWarn("Embedding", "건너뜀 — 검색 기록 벡터 저장이 비활성화됩니다")
	}

	// ── Auto-generate secrets ─────────────────────────────────────────────────
	EnsureSecrets(&cfg)

	// ── Save config ───────────────────────────────────────────────────────────
	if err := SaveConfig(cfg); err != nil {
		return fmt.Errorf("config save failed: %w", err)
	}

	// ── Done ──────────────────────────────────────────────────────────────────
	fmt.Println()
	tw := termWidth()
	fmt.Println(sSuccess.Render(strings.Repeat("═", tw)))
	fmt.Println(centreInWidth(sGold.Render("✦  설정 완료  ✦"), tw))
	fmt.Println(sSuccess.Render(strings.Repeat("═", tw)))
	fmt.Println()
	PrintInfo("설정 파일: " + ConfigPath())
	fmt.Println()

	// ── Next steps ────────────────────────────────────────────────────────────
	PrintInlineHeader("다음 단계")
	fmt.Println()

	type nextStep struct {
		title string
		cmd   string
		desc  string
	}
	printStep := func(n int, s nextStep) {
		fmt.Printf("  %s  %s\n", sGold.Render(fmt.Sprintf("%d.", n)), sBold.Render(s.title))
		if s.cmd != "" {
			fmt.Printf("     %s\n", sStar.Render("$ "+s.cmd))
		}
		fmt.Printf("     %s\n", sNebula.Render(s.desc))
		fmt.Println()
	}

	steps := []nextStep{
		{
			title: "서비스 시작",
			cmd:   "starnion start",
			desc:  fmt.Sprintf("Gateway :%d + Agent :%d + Web :%d 모든 서비스를 한 번에 실행", cfg.Gateway.Port, cfg.Gateway.GRPCPort, cfg.UI.Port),
		},
		{
			title: "웹 브라우저 접속",
			desc:  fmt.Sprintf("http://localhost:%d 에서 로그인 후 사용", cfg.UI.Port),
		},
	}
	steps = append(steps, nextStep{
		title: "Telegram 연결 (선택)",
		desc:  "Settings → Channels → Telegram 봇 토큰 입력 후 연결",
	})
	if cfg.Embedding.APIKey == "" {
		steps = append(steps, nextStep{
			title: "임베딩 엔진 (선택)",
			cmd:   "starnion config embedding",
			desc:  "OpenAI(권장) 또는 Gemini 선택 후 API Key 입력",
		})
	}
	steps = append(steps, nextStep{
		title: "Docker로 실행하려면",
		cmd:   "starnion docker up -d",
		desc:  "Docker Compose로 모든 서비스를 컨테이너로 실행 (starnion start 대신 사용 가능)",
	})

	for i, s := range steps {
		printStep(i+1, s)
	}

	fmt.Println(sNebula.Render(strings.Repeat("─", tw)))
	fmt.Printf("  %s  %s\n\n", sSuccess.Render("▶"), sBold.Render("StarNion 준비 완료!"))

	return nil
}

// ── Config subcommands ────────────────────────────────────────────────────────

// RunConfigModels runs an interactive wizard to update model defaults.
func RunConfigModels() error {
	PrintBanner("1.0.0")
	PrintSectionHeader(0, 0, "AI MODEL DEFAULTS 설정")

	cfg, err := LoadConfig()
	if err != nil {
		return fmt.Errorf("설정 파일 로드 실패: %w", err)
	}

	PrintInfo("현재 모델 설정:")
	PrintInfo("  Chat:    " + cfg.Models.Defaults.Chat)
	PrintInfo("  Report:  " + cfg.Models.Defaults.Report)
	PrintInfo("  Diary:   " + cfg.Models.Defaults.Diary)
	PrintInfo("  Goals:   " + cfg.Models.Defaults.Goals)
	PrintInfo("  Finance: " + cfg.Models.Defaults.Finance)
	fmt.Println()

	claudeModels := []huh.Option[string]{
		huh.NewOption("claude-sonnet-4-5 (균형)", "claude-sonnet-4-5"),
		huh.NewOption("claude-opus-4-6 (최고 성능)", "claude-opus-4-6"),
		huh.NewOption("claude-haiku-4-5-20251001 (빠름, 경제적)", "claude-haiku-4-5-20251001"),
		huh.NewOption("claude-sonnet-4-6 (최신 Sonnet)", "claude-sonnet-4-6"),
	}

	if err := huh.NewForm(huh.NewGroup(
		huh.NewSelect[string]().
			Title("Chat 모델").
			Options(claudeModels...).
			Value(&cfg.Models.Defaults.Chat),
		huh.NewSelect[string]().
			Title("Report 모델").
			Options(claudeModels...).
			Value(&cfg.Models.Defaults.Report),
		huh.NewSelect[string]().
			Title("Diary 모델").
			Options(claudeModels...).
			Value(&cfg.Models.Defaults.Diary),
		huh.NewSelect[string]().
			Title("Goals 모델").
			Options(claudeModels...).
			Value(&cfg.Models.Defaults.Goals),
		huh.NewSelect[string]().
			Title("Finance 모델").
			Options(claudeModels...).
			Value(&cfg.Models.Defaults.Finance),
	)).Run(); err != nil {
		return fmt.Errorf("cancelled: %w", err)
	}

	if err := SaveConfig(cfg); err != nil {
		return fmt.Errorf("설정 저장 실패: %w", err)
	}

	fmt.Println()
	PrintOK("Models", "설정이 저장되었습니다.")
	PrintWarn("재시작", "변경 사항을 적용하려면 게이트웨이를 재시작하세요.")
	fmt.Println()
	return nil
}

// RunConfigEmbedding runs an interactive wizard to set the embedding engine.
func RunConfigEmbedding() error {
	PrintBanner("1.0.0")
	PrintSectionHeader(0, 0, "EMBEDDING ENGINE 설정")

	cfg, err := LoadConfig()
	if err != nil {
		return fmt.Errorf("설정 파일 로드 실패: %w", err)
	}

	if cfg.Embedding.APIKey != "" {
		PrintOK("Embedding", fmt.Sprintf("현재: %s / %s (%d dims)",
			cfg.Embedding.Provider, cfg.Embedding.Model, cfg.Embedding.Dimensions))
	} else {
		PrintWarn("Embedding", "현재 미설정 — 검색 기록 벡터 저장이 비활성화됩니다.")
	}
	fmt.Println()
	PrintInfo("⚠  모든 사용자가 동일한 임베딩 모델을 공유합니다.")
	PrintInfo("   설정 변경 시 기존 DB 벡터를 전부 재생성해야 합니다.")
	fmt.Println()

	var provider string
	if err := huh.NewForm(huh.NewGroup(
		huh.NewSelect[string]().
			Title("임베딩 프로바이더").
			Options(
				huh.NewOption("OpenAI — text-embedding-3-small (권장)", "openai"),
				huh.NewOption("Gemini — gemini-embedding-001 (무료 1,500 req/일)", "gemini"),
			).
			Value(&provider),
	)).Run(); err != nil {
		return fmt.Errorf("cancelled: %w", err)
	}

	keyPlaceholder := map[string]string{
		"openai": "sk-...",
		"gemini": "AIzaSy...",
	}[provider]

	var apiKey string
	if err := huh.NewForm(huh.NewGroup(
		huh.NewInput().
			Title("API Key").
			EchoMode(huh.EchoModePassword).
			Placeholder(keyPlaceholder).
			Value(&apiKey),
	)).Run(); err != nil {
		return fmt.Errorf("cancelled: %w", err)
	}

	if apiKey == "" {
		PrintInfo("변경 사항 없이 종료합니다.")
		return nil
	}

	if cfg.Embedding.APIKey != "" && cfg.Embedding.Provider != provider {
		PrintWarn("경고", fmt.Sprintf("프로바이더를 %s → %s 로 변경하면 기존 벡터 데이터가 무효화됩니다.",
			cfg.Embedding.Provider, provider))
		var confirm bool
		_ = huh.NewForm(huh.NewGroup(
			huh.NewConfirm().Title("계속하시겠습니까?").Value(&confirm),
		)).Run()
		if !confirm {
			PrintInfo("취소됩니다.")
			return nil
		}
	}

	cfg.Embedding.Provider = provider
	cfg.Embedding.APIKey = apiKey
	if cfg.Embedding.Dimensions == 0 {
		cfg.Embedding.Dimensions = 768
	}
	if provider == "openai" {
		cfg.Embedding.Model = "text-embedding-3-small"
	} else {
		cfg.Embedding.Model = "gemini-embedding-001"
	}

	if err := SaveConfig(cfg); err != nil {
		return fmt.Errorf("설정 저장 실패: %w", err)
	}

	fmt.Println()
	PrintOK("Embedding", fmt.Sprintf("%s / %s (%d dims) 저장 완료",
		cfg.Embedding.Provider, cfg.Embedding.Model, cfg.Embedding.Dimensions))
	PrintWarn("재시작", "변경 사항을 적용하려면 agent 서비스를 재시작하세요.")
	fmt.Println()
	return nil
}

// ── Internal helpers ──────────────────────────────────────────────────────────

func applyDBDefaults(cfg *StarNionConfig) {
	if cfg.Database.Host == "" {
		cfg.Database.Host = "localhost"
	}
	if cfg.Database.Name == "" {
		cfg.Database.Name = "starnion"
	}
	if cfg.Database.User == "" {
		cfg.Database.User = "postgres"
	}
	if cfg.Database.Port == 0 {
		cfg.Database.Port = 5432
	}
	if cfg.Database.SSLMode == "" {
		cfg.Database.SSLMode = "disable"
	}
}

// checkPostgresWithWait waits up to 30 s for PostgreSQL to respond on host:port.
func checkPostgresWithWait(host string, port int) {
	addr := fmt.Sprintf("%s:%d", host, port)
	PrintInfo(fmt.Sprintf("PostgreSQL 연결 대기 중 (%s)...", addr))
	deadline := time.Now().Add(30 * time.Second)
	for time.Now().Before(deadline) {
		conn, err := net.DialTimeout("tcp", addr, 2*time.Second)
		if err == nil {
			conn.Close()
			PrintOK("PostgreSQL", addr+" 응답 확인")
			return
		}
		time.Sleep(2 * time.Second)
	}
	PrintWarn("PostgreSQL", "30초 내 응답 없음 — 계속 진행하지만 오류가 발생할 수 있습니다")
}

// checkMinIO performs a simple HTTP HEAD request to the MinIO public URL.
func checkMinIO(publicURL string) bool {
	if publicURL == "" {
		return false
	}
	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Head(publicURL)
	if err != nil {
		return false
	}
	resp.Body.Close()
	return true
}

// runSystemCheck prints the status of required tools.
func runSystemCheck() {
	checks := []struct{ name, cmd, hint string }{
		{"Node.js", "node", ""},
		{"pnpm", "pnpm", "npm install -g pnpm"},
		{"uv", "uv", "curl -LsSf https://astral.sh/uv/install.sh | sh"},
	}
	for _, c := range checks {
		if commandExists(c.cmd) {
			PrintOK(c.name, "설치 확인")
		} else {
			if c.hint != "" {
				PrintWarn(c.name, "설치되지 않음 ("+c.hint+")")
			} else {
				PrintWarn(c.name, "설치되지 않음")
			}
		}
	}
	fmt.Println()
}

func commandExists(cmd string) bool {
	conn, err := net.LookupHost(cmd)
	_ = conn
	// Use a simple PATH lookup instead.
	path, _ := lookupPath(cmd)
	return err == nil || path != ""
}

func lookupPath(cmd string) (string, error) {
	for _, dir := range strings.Split(os.Getenv("PATH"), ":") {
		full := dir + "/" + cmd
		if _, err := os.Stat(full); err == nil {
			return full, nil
		}
	}
	return "", fmt.Errorf("not found")
}

// ── Database helpers ──────────────────────────────────────────────────────────

func connectAndMigrate(cfg StarNionConfig) error {
	if err := ensureDatabase(cfg); err != nil {
		return err
	}
	return runMigrations(cfg)
}

func ensureDatabase(cfg StarNionConfig) error {
	d := cfg.Database
	ctx := context.Background()

	// 1. Try connecting directly to the target database.
	targetURL := fmt.Sprintf("postgresql://%s:%s@%s:%d/%s?sslmode=%s",
		d.User, d.Password, d.Host, d.Port, d.Name, d.SSLMode)
	if conn, err := pgx.Connect(ctx, targetURL); err == nil {
		conn.Close(ctx)
		PrintInfo(fmt.Sprintf("데이터베이스 '%s' 이미 존재합니다.", d.Name))
		return nil
	}

	// 2. Target DB doesn't exist or can't connect — try admin DB to create it.
	//    Try "postgres" first, then the user's DB name as fallback.
	var conn *pgx.Conn
	var err error
	for _, adminDB := range []string{"postgres", d.Name} {
		adminURL := fmt.Sprintf("postgresql://%s:%s@%s:%d/%s?sslmode=%s",
			d.User, d.Password, d.Host, d.Port, adminDB, d.SSLMode)
		conn, err = pgx.Connect(ctx, adminURL)
		if err == nil {
			break
		}
	}
	if err != nil {
		return fmt.Errorf("PostgreSQL 연결 실패: %w\n  확인: 사용자 '%s'가 DB 접근 권한이 있는지 pg_hba.conf를 확인하세요.", err, d.User)
	}
	defer conn.Close(ctx)

	var exists bool
	err = conn.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = $1)`, d.Name,
	).Scan(&exists)
	if err != nil {
		return fmt.Errorf("DB 존재 여부 확인 실패: %w", err)
	}

	if exists {
		PrintInfo(fmt.Sprintf("데이터베이스 '%s' 이미 존재합니다.", d.Name))
		return nil
	}

	// Database names cannot be parameterised.
	if _, err := conn.Exec(ctx,
		fmt.Sprintf(`CREATE DATABASE "%s"`, d.Name)); err != nil {
		return fmt.Errorf("데이터베이스 '%s' 생성 실패: %w", d.Name, err)
	}
	PrintOK("DB", fmt.Sprintf("데이터베이스 '%s' 생성 완료", d.Name))
	return nil
}

func runMigrations(cfg StarNionConfig) error {
	conn, err := pgx.Connect(context.Background(), cfg.Database.DatabaseURL())
	if err != nil {
		return fmt.Errorf("DB 연결 실패: %w", err)
	}
	defer conn.Close(context.Background())

	// Ensure migration tracking table.
	if _, err := conn.Exec(context.Background(), `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version    TEXT        NOT NULL PRIMARY KEY,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
	`); err != nil {
		return fmt.Errorf("schema_migrations 테이블 생성 실패: %w", err)
	}

	// Collect migration files.
	entries, err := fs.ReadDir(migrationFS, "migrations")
	if err != nil {
		return fmt.Errorf("migrations 디렉토리 읽기 실패: %w", err)
	}

	var files []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".sql") {
			files = append(files, e.Name())
		}
	}
	sort.Strings(files)

	for _, filename := range files {
		version := strings.TrimSuffix(filename, ".sql")

		var applied bool
		conn.QueryRow(context.Background(),
			`SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version = $1)`, version,
		).Scan(&applied)
		if applied {
			continue
		}

		content, err := migrationFS.ReadFile("migrations/" + filename)
		if err != nil {
			return fmt.Errorf("마이그레이션 읽기 실패 (%s): %w", filename, err)
		}

		PrintInfo(fmt.Sprintf("마이그레이션 적용 중: %s", filename))
		if _, err := conn.Exec(context.Background(), string(content)); err != nil {
			return fmt.Errorf("마이그레이션 실패 (%s): %w", filename, err)
		}
		if _, err := conn.Exec(context.Background(),
			`INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING`, version,
		); err != nil {
			return fmt.Errorf("schema_migrations 기록 실패 (%s): %w", version, err)
		}
		PrintOK("Migration", version+" 완료")
	}

	return nil
}

func createAdminUser(cfg StarNionConfig, name, email, password, language string) (string, error) {
	conn, err := pgx.Connect(context.Background(), cfg.Database.DatabaseURL())
	if err != nil {
		return "", fmt.Errorf("DB 연결 실패: %w", err)
	}
	defer conn.Close(context.Background())

	// Check if the user already exists and return their ID if so.
	var existingID string
	conn.QueryRow(context.Background(),
		`SELECT id FROM users WHERE email = $1`, email,
	).Scan(&existingID)
	if existingID != "" {
		PrintInfo(fmt.Sprintf("%s 계정이 이미 존재합니다. 건너뜁니다.", email))
		return existingID, nil
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", fmt.Errorf("비밀번호 해싱 실패: %w", err)
	}

	tx, err := conn.Begin(context.Background())
	if err != nil {
		return "", fmt.Errorf("트랜잭션 시작 실패: %w", err)
	}
	defer tx.Rollback(context.Background()) //nolint:errcheck

	var userID string
	if err := tx.QueryRow(context.Background(), `
		INSERT INTO users (id, display_name, email, password_hash, role, preferences)
		VALUES (gen_random_uuid(), $1, $2, $3, 'admin',
		        jsonb_build_object('language', $4::TEXT))
		RETURNING id`,
		name, email, string(hash), language,
	).Scan(&userID); err != nil {
		return "", fmt.Errorf("users 삽입 실패: %w", err)
	}

	if _, err := tx.Exec(context.Background(), `
		INSERT INTO platform_identities (user_id, platform, platform_id, display_name)
		VALUES ($1, 'credential', $2, $3)
		ON CONFLICT (platform, platform_id) DO NOTHING`,
		userID, email, name,
	); err != nil {
		return "", fmt.Errorf("platform_identities 삽입 실패: %w", err)
	}

	return userID, tx.Commit(context.Background())
}

// detectProjectRoot attempts to find the project root by looking for go.work
// or a known directory structure up from the config dir.
func detectProjectRoot() string {
	// Try adjacent to the executable.
	exe, err := os.Executable()
	if err != nil {
		return ""
	}
	// Walk up from the executable directory looking for go.work.
	dir := exe
	for i := 0; i < 5; i++ {
		dir = strings.TrimRight(dir, "/")
		parent := dir[:strings.LastIndex(dir, "/")]
		if parent == "" || parent == dir {
			break
		}
		dir = parent
		if _, err := os.Stat(dir + "/go.work"); err == nil {
			return dir
		}
	}
	return ""
}

