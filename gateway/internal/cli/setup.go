package cli

import (
	"database/sql"
	"embed"
	"fmt"
	"sort"
	"strconv"
	"strings"

	"github.com/charmbracelet/huh"
	_ "github.com/lib/pq"
)

// migrations embeds init.sql (baseline) and the incremental/ subdirectory.
//
//go:embed migrations
var migrationFS embed.FS

// RunSetup executes the interactive 7-step setup wizard.
func RunSetup(projectRoot string) error {
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
	// [1/6] SYSTEM CHECK
	// ════════════════════════════════════════════════════════════════════════════
	PrintSectionHeader(1, 7, "SYSTEM CHECK")
	_ = RunSystemCheck(cfg.Database.Host, cfg.Database.Port, cfg.MinIO.PublicURL)

	// ════════════════════════════════════════════════════════════════════════════
	// [2/6] DATABASE
	// ════════════════════════════════════════════════════════════════════════════
	PrintSectionHeader(2, 7, "DATABASE")
	PrintInfo("PostgreSQL 접속 정보를 입력해주세요.")
	fmt.Println()

	var dbPort string
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
			Title("Database").
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

	// Apply defaults for empty fields
	if cfg.Database.Host == "" {
		cfg.Database.Host = "localhost"
	}
	if cfg.Database.Name == "" {
		cfg.Database.Name = "starnion"
	}
	if cfg.Database.User == "" {
		cfg.Database.User = "postgres"
	}

	// Verify connection + run migrations
	if err := connectAndMigrate(cfg, projectRoot); err != nil {
		PrintFail("Database", err.Error())
		return err
	}
	PrintOK("Database", "연결 성공 및 마이그레이션 완료")

	// ════════════════════════════════════════════════════════════════════════════
	// [3/6] ADMIN ACCOUNT
	// ════════════════════════════════════════════════════════════════════════════
	PrintSectionHeader(3, 7, "ADMIN ACCOUNT")
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
			continue
		}
		break
	}

	if err := createAdminUser(cfg, adminName, adminEmail, adminPassword); err != nil {
		PrintFail("Admin", err.Error())
		return err
	}
	cfg.Admin.Email = adminEmail
	PrintOK("Admin", adminName+"("+adminEmail+") 계정 생성 완료")

	// ════════════════════════════════════════════════════════════════════════════
	// [4/6] MINIO (FILE STORAGE)
	// ════════════════════════════════════════════════════════════════════════════
	PrintSectionHeader(4, 7, "FILE STORAGE (MinIO)")
	PrintInfo("이미지 및 파일 저장소 정보를 입력해주세요.")
	fmt.Println()

	if err := huh.NewForm(huh.NewGroup(
		huh.NewInput().
			Title("Public URL").
			Description("파일을 외부에서 접근할 URL (Endpoint와 UseSSL은 자동 설정됩니다)").
			Placeholder("http://localhost:9000").
			Value(&cfg.MinIO.PublicURL),
		huh.NewInput().
			Title("Access Key").
			Placeholder("minioadmin").
			Value(&cfg.MinIO.AccessKey),
		huh.NewInput().
			Title("Secret Key").
			EchoMode(huh.EchoModePassword).
			Value(&cfg.MinIO.SecretKey),
		huh.NewInput().
			Title("Bucket").
			Placeholder("starnion-files").
			Value(&cfg.MinIO.Bucket),
	)).Run(); err != nil {
		return fmt.Errorf("minio setup cancelled: %w", err)
	}

	if cfg.MinIO.PublicURL == "" {
		cfg.MinIO.PublicURL = "http://localhost:9000"
	}
	if cfg.MinIO.Bucket == "" {
		cfg.MinIO.Bucket = "starnion-files"
	}
	cfg.MinIO.DeriveEndpoint()

	// Verify MinIO reachability
	if !CheckMinIO(cfg.MinIO.PublicURL) {
		PrintWarn("MinIO", "연결 실패 — 설정은 저장되지만 서비스 시작 전 MinIO를 실행하세요")
	} else {
		PrintOK("MinIO", "연결 확인")
	}

	// ════════════════════════════════════════════════════════════════════════════
	// [5/6] SERVICE URLs
	// ════════════════════════════════════════════════════════════════════════════
	PrintSectionHeader(5, 7, "SERVICE URLs")
	PrintInfo("서비스 URL을 설정합니다. 로컬 개발이면 그대로 Enter를 누르세요.")
	fmt.Println()

	if err := huh.NewForm(huh.NewGroup(
		huh.NewInput().
			Title("Gateway URL").
			Placeholder("http://localhost:8080").
			Value(&cfg.Gateway.URL),
	)).Run(); err != nil {
		return fmt.Errorf("url setup cancelled: %w", err)
	}

	if cfg.Gateway.URL == "" {
		cfg.Gateway.URL = "http://localhost:8080"
	}

	// ════════════════════════════════════════════════════════════════════════════
	// [6/6] GOOGLE OAUTH (선택)
	// ════════════════════════════════════════════════════════════════════════════
	PrintSectionHeader(6, 7, "GOOGLE OAUTH (선택)")
	PrintInfo("Google Calendar / Gmail / Drive 연동을 위한 OAuth2 앱 자격증명입니다.")
	PrintInfo("건너뛰려면 모든 항목을 비워두고 Enter를 누르세요.")
	PrintInfo("나중에 설정하려면: starnion config google")
	fmt.Println()

	if err := huh.NewForm(huh.NewGroup(
		huh.NewInput().
			Title("Google Client ID").
			Placeholder("123456789-xxx.apps.googleusercontent.com  (없으면 Enter)").
			Value(&cfg.Google.ClientID),
		huh.NewInput().
			Title("Google Client Secret").
			EchoMode(huh.EchoModePassword).
			Placeholder("GOCSPX-...  (없으면 Enter)").
			Value(&cfg.Google.ClientSecret),
	)).Run(); err != nil {
		return fmt.Errorf("google setup cancelled: %w", err)
	}

	// Redirect URI는 Gateway URL에서 자동 생성 (입력값 없을 때)
	if cfg.Google.ClientID != "" && cfg.Google.RedirectURI == "" {
		cfg.Google.RedirectURI = cfg.Gateway.URL + "/auth/google/callback"
	}

	if cfg.Google.ClientID != "" {
		PrintOK("Google OAuth", "자격증명 설정 완료 (redirect URI: "+cfg.Google.RedirectURI+")")
	} else {
		PrintWarn("Google OAuth", "건너뜀 — 나중에 'starnion config google'로 설정 가능")
	}

	// ════════════════════════════════════════════════════════════════════════════
	// [7/7] EMBEDDING ENGINE (선택)
	// ════════════════════════════════════════════════════════════════════════════
	PrintSectionHeader(7, 7, "EMBEDDING ENGINE (선택)")
	PrintInfo("검색 기록·문서 벡터 저장에 사용되는 서버 공용 임베딩 엔진입니다.")
	PrintInfo("⚠  모든 사용자가 동일한 모델을 공유합니다. 설정 후 변경 시 DB 재색인 필요.")
	PrintInfo("건너뛰려면 Enter. 나중에 설정: starnion config embedding")
	fmt.Println()

	var embeddingProvider string
	if err := huh.NewForm(huh.NewGroup(
		huh.NewSelect[string]().
			Title("임베딩 프로바이더").
			Description("OpenAI 권장 (이미 OpenAI 키가 있다면 추가 비용 거의 없음)").
			Options(
				huh.NewOption("OpenAI — text-embedding-3-small (권장, $0.02/1M tokens)", "openai"),
				huh.NewOption("Gemini — gemini-embedding-001 (무료 1,500 req/일)", "gemini"),
				huh.NewOption("건너뜀", "skip"),
			).
			Value(&embeddingProvider),
	)).Run(); err != nil {
		return fmt.Errorf("embedding setup cancelled: %w", err)
	}

	if embeddingProvider != "skip" && embeddingProvider != "" {
		var embeddingAPIKey string
		keyPlaceholder := map[string]string{
			"openai": "sk-...",
			"gemini": "AIzaSy...",
		}[embeddingProvider]

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
			if embeddingProvider == "openai" {
				cfg.Embedding.Model = "text-embedding-3-small"
			} else {
				cfg.Embedding.Model = "gemini-embedding-001"
			}
			cfg.Embedding.Dimensions = 768
			PrintOK("Embedding", embeddingProvider+" / "+cfg.Embedding.Model+" (768 dims)")
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

	// ── Write ui/.env (Next.js requires env vars at build time) ──────────────
	if err := WriteUIEnv(cfg, projectRoot); err != nil {
		PrintWarn("env", fmt.Sprintf("ui/.env 생성 실패: %v", err))
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

	// ── Onboarding steps ──────────────────────────────────────────────────────
	PrintInlineHeader("시작하기 전에")
	fmt.Println()

	step := func(n, title, desc string) {
		fmt.Printf("  %s  %s\n", sGold.Render(n+"."), sBold.Render(title))
		fmt.Printf("     %s\n", sNebula.Render(desc))
		fmt.Println()
	}

	step("1", "서비스 시작",
		"starnion dev  (또는 docker: starnion docker setup)")
	step("2", "로그인",
		"브라우저에서 http://localhost:3000 접속 후 회원가입 또는 로그인")
	step("3", "모델 설정",
		"Settings → Model → 프로바이더(Anthropic / OpenAI 등) 선택 → 사용할 모델 선택 후 API Key 입력")
	step("4", "페르소나 설정",
		"Settings → Personas → 페르소나별로 프로바이더와 모델을 선택  (기본 페르소나를 반드시 지정)")
	step("5", "채널 연결 (선택)",
		"Settings → Channels → 사용할 채널(Telegram 등)의 봇 토큰 입력 후 활성화")
	step("6", "계정 연결 (선택)",
		"텔레그램에서 /link 명령을 보내면 웹 계정과 텔레그램 계정이 연결됩니다")
	step("7", "Google 연동 (선택)",
		"starnion config google → Google Cloud Console OAuth 앱의 Client ID / Secret 입력")
	step("8", "임베딩 엔진 (선택)",
		"starnion config embedding → OpenAI(권장) 또는 Gemini 중 선택 후 API Key 입력")

	fmt.Println(sNebula.Render(strings.Repeat("─", tw)))
	fmt.Printf("  %s  %s\n\n", sSuccess.Render("▶"), sBold.Render("starnion dev"))

	return nil
}

// RunConfigGoogle runs an interactive wizard to set (or update) Google OAuth2
// credentials in ~/.starnion/starnion.yaml.
func RunConfigGoogle() error {
	PrintBanner("1.0.0")
	PrintSectionHeader(0, 0, "GOOGLE OAUTH 설정")

	cfg, err := LoadConfig()
	if err != nil {
		return fmt.Errorf("설정 파일 로드 실패: %w", err)
	}

	// Show current state
	if cfg.Google.ClientID != "" {
		PrintInfo("현재 Client ID: " + cfg.Google.ClientID[:min(len(cfg.Google.ClientID), 20)] + "...")
		PrintInfo("현재 Redirect URI: " + cfg.Google.RedirectURI)
	} else {
		PrintWarn("Google OAuth", "현재 미설정 상태입니다.")
	}
	fmt.Println()
	PrintInfo("Google Cloud Console → APIs & Services → 사용자 인증 정보 → OAuth 2.0 클라이언트 ID에서 발급받으세요.")
	PrintInfo("승인된 리디렉션 URI에 아래 주소를 추가해야 합니다:")
	PrintInfo("  " + cfg.Gateway.URL + "/auth/google/callback")
	fmt.Println()

	var clientID, clientSecret string

	if err := huh.NewForm(huh.NewGroup(
		huh.NewInput().
			Title("Google Client ID").
			Placeholder("123456789-xxx.apps.googleusercontent.com").
			Value(&clientID),
		huh.NewInput().
			Title("Google Client Secret").
			EchoMode(huh.EchoModePassword).
			Placeholder("GOCSPX-...").
			Value(&clientSecret),
	)).Run(); err != nil {
		return fmt.Errorf("cancelled: %w", err)
	}

	if clientID == "" && clientSecret == "" {
		PrintInfo("변경 사항 없이 종료합니다.")
		return nil
	}

	if clientID != "" {
		cfg.Google.ClientID = clientID
	}
	if clientSecret != "" {
		cfg.Google.ClientSecret = clientSecret
	}
	// Redirect URI는 Gateway URL 기반으로 자동 설정
	cfg.Google.RedirectURI = cfg.Gateway.URL + "/auth/google/callback"

	if err := SaveConfig(cfg); err != nil {
		return fmt.Errorf("설정 저장 실패: %w", err)
	}

	fmt.Println()
	PrintOK("Google OAuth", "설정이 저장되었습니다.")
	PrintInfo("Redirect URI: " + cfg.Google.RedirectURI)
	PrintWarn("재시작", "변경 사항을 적용하려면 starnion gateway를 재시작하세요.")
	fmt.Println()
	return nil
}

// RunConfigGemini runs an interactive wizard to set (or update) the default
// Gemini model used for image generation, vision analysis, and audio processing.
// API keys are registered per-user via the web UI (설정 → 연동 → Gemini).
func RunConfigGemini() error {
	PrintBanner("1.0.0")
	PrintSectionHeader(0, 0, "GEMINI 모델 설정")

	cfg, err := LoadConfig()
	if err != nil {
		return fmt.Errorf("설정 파일 로드 실패: %w", err)
	}

	PrintInfo("현재 모델: " + cfg.Gemini.Model)
	fmt.Println()
	PrintInfo("Gemini API 키는 사용자별로 웹 UI에서 등록합니다.")
	PrintInfo("(설정 → 연동 → Gemini)")
	fmt.Println()

	model := cfg.Gemini.Model
	if model == "" {
		model = "gemini-2.5-pro"
	}

	if err := huh.NewForm(huh.NewGroup(
		huh.NewInput().
			Title("모델 (기본값: gemini-2.5-pro)").
			Placeholder("gemini-2.5-pro").
			Value(&model),
	)).Run(); err != nil {
		return fmt.Errorf("cancelled: %w", err)
	}

	if model == cfg.Gemini.Model {
		PrintInfo("변경 사항 없이 종료합니다.")
		return nil
	}

	if model != "" {
		cfg.Gemini.Model = model
	}

	if err := SaveConfig(cfg); err != nil {
		return fmt.Errorf("설정 저장 실패: %w", err)
	}

	fmt.Println()
	PrintOK("Gemini 모델", "설정이 저장되었습니다.")
	PrintWarn("재시작", "변경 사항을 적용하려면 starnion agent를 재시작하세요.")
	fmt.Println()
	return nil
}

// RunConfigEmbedding runs an interactive wizard to set (or update) the embedding
// engine configuration in ~/.starnion/starnion.yaml.
func RunConfigEmbedding() error {
	PrintBanner("1.0.0")
	PrintSectionHeader(0, 0, "EMBEDDING ENGINE 설정")

	cfg, err := LoadConfig()
	if err != nil {
		return fmt.Errorf("설정 파일 로드 실패: %w", err)
	}

	// Show current state
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

	// Warn if changing provider with existing data
	if cfg.Embedding.APIKey != "" && cfg.Embedding.Provider != provider {
		PrintWarn("경고", fmt.Sprintf(
			"프로바이더를 %s → %s 로 변경하면 기존 벡터 데이터가 무효화됩니다.",
			cfg.Embedding.Provider, provider,
		))
		var confirm bool
		_ = huh.NewForm(huh.NewGroup(
			huh.NewConfirm().
				Title("계속하시겠습니까?").
				Value(&confirm),
		)).Run()
		if !confirm {
			PrintInfo("취소됩니다.")
			return nil
		}
	}

	cfg.Embedding.Provider = provider
	cfg.Embedding.APIKey = apiKey
	cfg.Embedding.Dimensions = 768
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
	PrintWarn("재시작", "변경 사항을 적용하려면 starnion agent를 재시작하세요.")
	fmt.Println()
	return nil
}

// ── Database helpers ──────────────────────────────────────────────────────────

// ensureDatabase connects to the postgres system database and creates the
// target database if it does not already exist.
func ensureDatabase(cfg StarNionConfig) error {
	d := cfg.Database
	// Build a DSN that points at the "postgres" maintenance database so we can
	// issue CREATE DATABASE without being connected to the target DB.
	adminDSN := fmt.Sprintf(
		"host=%s port=%d dbname=postgres user=%s password=%s sslmode=%s",
		d.Host, d.Port, d.User, d.Password, d.SSLMode,
	)

	admin, err := sql.Open("postgres", adminDSN)
	if err != nil {
		return fmt.Errorf("관리자 DB 연결 실패: %w", err)
	}
	defer admin.Close()

	if err := admin.Ping(); err != nil {
		return fmt.Errorf("PostgreSQL 서버 접속 실패: %w", err)
	}

	var exists bool
	admin.QueryRow(
		`SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = $1)`, d.Name,
	).Scan(&exists)

	if exists {
		PrintInfo(fmt.Sprintf("데이터베이스 '%s' 이미 존재합니다.", d.Name))
		return nil
	}

	// Database names cannot be parameterised — sanitise manually.
	if _, err := admin.Exec(fmt.Sprintf(`CREATE DATABASE "%s"`, d.Name)); err != nil {
		return fmt.Errorf("데이터베이스 '%s' 생성 실패: %w", d.Name, err)
	}
	PrintOK("DB", fmt.Sprintf("데이터베이스 '%s' 생성 완료", d.Name))
	return nil
}

func connectAndMigrate(cfg StarNionConfig, projectRoot string) error {
	// Create the target database if it does not exist yet.
	if err := ensureDatabase(cfg); err != nil {
		return err
	}

	db, err := sql.Open("postgres", cfg.Database.DSN())
	if err != nil {
		return fmt.Errorf("DB 연결 실패: %w", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		return fmt.Errorf("DB 접속 실패: %w", err)
	}

	return runMigrations(db, projectRoot)
}

func runMigrations(db *sql.DB, _ string) error {
	// Ensure the migration tracking table exists.
	if _, err := db.Exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
		version    TEXT        NOT NULL PRIMARY KEY,
		applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	)`); err != nil {
		return fmt.Errorf("schema_migrations 테이블 생성 실패: %w", err)
	}

	// Detect fresh vs existing install by checking if the users table exists.
	var hasUsers bool
	db.QueryRow(`SELECT EXISTS (
		SELECT 1 FROM information_schema.tables
		WHERE table_schema = 'public' AND table_name = 'users'
	)`).Scan(&hasUsers)

	var baselineApplied bool
	db.QueryRow(`SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '1.0.0')`).Scan(&baselineApplied)

	if !hasUsers && !baselineApplied {
		// Fresh database: apply the full baseline schema.
		PrintInfo("신규 설치: 기본 스키마(v1.0.0)를 적용합니다...")
		if err := applyBaseline(db); err != nil {
			return fmt.Errorf("baseline 적용 실패: %w", err)
		}
		if _, err := db.Exec(`INSERT INTO schema_migrations (version) VALUES ('1.0.0') ON CONFLICT DO NOTHING`); err != nil {
			return fmt.Errorf("schema_migrations 기록 실패: %w", err)
		}
		PrintOK("DB", "기본 스키마 적용 완료 (v1.0.0)")
	} else if !baselineApplied {
		// Existing database upgraded to the new migration system: stamp baseline as applied.
		if _, err := db.Exec(`INSERT INTO schema_migrations (version) VALUES ('1.0.0') ON CONFLICT DO NOTHING`); err != nil {
			return fmt.Errorf("schema_migrations 기록 실패: %w", err)
		}
		PrintInfo("기존 설치 감지: v1.0.0 baseline으로 마킹합니다.")
	}

	// Apply any pending incremental migrations.
	return applyIncrementalMigrations(db)
}

func applyBaseline(db *sql.DB) error {
	content, err := migrationFS.ReadFile("migrations/init.sql")
	if err != nil {
		return fmt.Errorf("migrations/init.sql을 읽을 수 없습니다: %w", err)
	}
	_, err = db.Exec(string(content))
	return err
}

func applyIncrementalMigrations(db *sql.DB) error {
	entries, err := migrationFS.ReadDir("migrations/incremental")
	if err != nil {
		// No incremental directory yet — nothing to do.
		return nil
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
		db.QueryRow(`SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version = $1)`, version).Scan(&applied)
		if applied {
			continue
		}

		content, err := migrationFS.ReadFile("migrations/incremental/" + filename)
		if err != nil {
			return fmt.Errorf("마이그레이션 읽기 실패 (%s): %w", filename, err)
		}

		PrintInfo(fmt.Sprintf("증분 마이그레이션 적용 중: %s", filename))
		if _, err := db.Exec(string(content)); err != nil {
			return fmt.Errorf("마이그레이션 실패 (%s): %w", filename, err)
		}
		if _, err := db.Exec(`INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING`, version); err != nil {
			return fmt.Errorf("schema_migrations 기록 실패 (%s): %w", version, err)
		}
		PrintOK("Migration", version+" 완료")
	}

	return nil
}

// fetchUserID returns the UUID of the user with the given email.
func fetchUserID(cfg StarNionConfig, email string) (string, error) {
	db, err := sql.Open("postgres", cfg.Database.DSN())
	if err != nil {
		return "", err
	}
	defer db.Close()

	var id string
	if err := db.QueryRow(`SELECT id FROM users WHERE email = $1`, email).Scan(&id); err != nil {
		return "", err
	}
	return id, nil
}

func createAdminUser(cfg StarNionConfig, name, email, password string) error {
	db, err := sql.Open("postgres", cfg.Database.DSN())
	if err != nil {
		return err
	}
	defer db.Close()

	var count int
	_ = db.QueryRow(`SELECT COUNT(*) FROM users WHERE email = $1`, email).Scan(&count)
	if count > 0 {
		PrintInfo(fmt.Sprintf("%s 계정이 이미 존재합니다. 건너뜁니다.", email))
		return nil
	}

	hash, err := bcryptHash(password)
	if err != nil {
		return fmt.Errorf("비밀번호 해싱 실패: %w", err)
	}

	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("트랜잭션 시작 실패: %w", err)
	}
	defer tx.Rollback() //nolint:errcheck

	// 1) users — display_name, email, password_hash, role 삽입
	var userID string
	if err := tx.QueryRow(
		`INSERT INTO users (id, display_name, email, password_hash, role)
		 VALUES (gen_random_uuid()::TEXT, $1, $2, $3, 'admin') RETURNING id`,
		name, email, hash,
	).Scan(&userID); err != nil {
		return fmt.Errorf("users 삽입 실패: %w", err)
	}

	// 2) platform_identities — credential 플랫폼 등록 (계정 연결용)
	if _, err := tx.Exec(`
		INSERT INTO platform_identities (user_id, platform, platform_id, display_name)
		VALUES ($1, 'credential', $2, $3)
		ON CONFLICT (platform, platform_id) DO NOTHING
	`, userID, email, name); err != nil {
		return fmt.Errorf("platform_identities 삽입 실패: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("트랜잭션 커밋 실패: %w", err)
	}
	return nil
}
