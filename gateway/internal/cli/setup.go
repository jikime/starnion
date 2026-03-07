package cli

import (
	"database/sql"
	"embed"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"github.com/charmbracelet/huh"
	_ "github.com/lib/pq"
)

// migrations embed is optional — if the directory doesn't exist at compile time
// (e.g. building the CLI standalone), we fall back to filesystem lookup.
//
//go:embed migrations/*
var migrationFS embed.FS

// RunSetup executes the interactive 5-step setup wizard.
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
	// [1/5] SYSTEM CHECK
	// ════════════════════════════════════════════════════════════════════════════
	PrintSectionHeader(1, 5, "SYSTEM CHECK")
	_ = RunSystemCheck(cfg.Database.Host, cfg.Database.Port, cfg.MinIO.Endpoint)

	// ════════════════════════════════════════════════════════════════════════════
	// [2/5] DATABASE
	// ════════════════════════════════════════════════════════════════════════════
	PrintSectionHeader(2, 5, "DATABASE")
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
			Placeholder("starpion").
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
		cfg.Database.Name = "starpion"
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
	// [3/5] ADMIN ACCOUNT
	// ════════════════════════════════════════════════════════════════════════════
	PrintSectionHeader(3, 5, "ADMIN ACCOUNT")
	PrintInfo("첫 번째 관리자 계정을 생성합니다.")
	fmt.Println()

	var adminEmail, adminPassword, adminPasswordConfirm string
	for {
		if err := huh.NewForm(huh.NewGroup(
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

	if err := createAdminUser(cfg, adminEmail, adminPassword); err != nil {
		PrintFail("Admin", err.Error())
		return err
	}
	cfg.Admin.Email = adminEmail
	PrintOK("Admin", adminEmail+" 계정 생성 완료")

	// ════════════════════════════════════════════════════════════════════════════
	// [4/5] MINIO (FILE STORAGE)
	// ════════════════════════════════════════════════════════════════════════════
	PrintSectionHeader(4, 5, "FILE STORAGE (MinIO)")
	PrintInfo("이미지 및 파일 저장소 정보를 입력해주세요.")
	fmt.Println()

	if err := huh.NewForm(huh.NewGroup(
		huh.NewInput().
			Title("Endpoint").
			Placeholder("localhost:9000").
			Value(&cfg.MinIO.Endpoint),
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
			Placeholder("starpion-files").
			Value(&cfg.MinIO.Bucket),
		huh.NewInput().
			Title("Public URL").
			Placeholder("http://localhost:9000").
			Value(&cfg.MinIO.PublicURL),
	)).Run(); err != nil {
		return fmt.Errorf("minio setup cancelled: %w", err)
	}

	if cfg.MinIO.Endpoint == "" {
		cfg.MinIO.Endpoint = "localhost:9000"
	}
	if cfg.MinIO.Bucket == "" {
		cfg.MinIO.Bucket = "starpion-files"
	}
	if cfg.MinIO.PublicURL == "" {
		cfg.MinIO.PublicURL = "http://localhost:9000"
	}

	// Verify MinIO reachability
	if !CheckMinIO(cfg.MinIO.Endpoint) {
		PrintWarn("MinIO", "연결 실패 — 설정은 저장되지만 서비스 시작 전 MinIO를 실행하세요")
	} else {
		PrintOK("MinIO", "연결 확인")
	}

	// ════════════════════════════════════════════════════════════════════════════
	// [5/5] SERVICE URLs
	// ════════════════════════════════════════════════════════════════════════════
	PrintSectionHeader(5, 5, "SERVICE URLs")
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

	// ── Auto-generate secrets ─────────────────────────────────────────────────
	EnsureSecrets(&cfg)

	// ── Save config ───────────────────────────────────────────────────────────
	if err := SaveConfig(cfg); err != nil {
		return fmt.Errorf("config save failed: %w", err)
	}

	// ── Write service .env files ──────────────────────────────────────────────
	if err := WriteEnvFiles(cfg, projectRoot); err != nil {
		PrintWarn("env", fmt.Sprintf(".env 파일 생성 실패: %v", err))
	}

	// ── Done ──────────────────────────────────────────────────────────────────
	fmt.Println()
	tw := termWidth()
	fmt.Println(sSuccess.Render(strings.Repeat("═", tw)))
	fmt.Println(centreInWidth(sGold.Render("✦  설정 완료  ✦"), tw))
	fmt.Println(sSuccess.Render(strings.Repeat("═", tw)))
	fmt.Println()
	PrintInfo("설정 파일: " + ConfigPath())
	PrintInfo("시작 명령: starpion dev")
	fmt.Println()

	return nil
}

// ── Database helpers ──────────────────────────────────────────────────────────

func connectAndMigrate(cfg StarPionConfig, projectRoot string) error {
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

func runMigrations(db *sql.DB, projectRoot string) error {
	// Prefer embedded FS; fall back to filesystem relative to projectRoot.
	migrationsDir := filepath.Join(projectRoot, "docker", "migrations")

	var sqlFiles []string

	if _, err := migrationFS.ReadDir("migrations"); err == nil {
		// Use embedded migrations
		fs.WalkDir(migrationFS, "migrations", func(path string, d fs.DirEntry, err error) error {
			if err == nil && !d.IsDir() && strings.HasSuffix(path, ".sql") {
				sqlFiles = append(sqlFiles, path)
			}
			return nil
		})
	} else {
		// Fallback: read from filesystem
		entries, err := os.ReadDir(migrationsDir)
		if err != nil {
			return fmt.Errorf("migrations 디렉토리를 찾을 수 없습니다: %w", err)
		}
		for _, e := range entries {
			if !e.IsDir() && strings.HasSuffix(e.Name(), ".sql") {
				sqlFiles = append(sqlFiles, filepath.Join(migrationsDir, e.Name()))
			}
		}
	}

	sort.Strings(sqlFiles)

	for _, path := range sqlFiles {
		var content []byte
		var err error

		if strings.HasPrefix(path, "migrations/") {
			content, err = migrationFS.ReadFile(path)
		} else {
			content, err = os.ReadFile(path)
		}
		if err != nil {
			return fmt.Errorf("마이그레이션 읽기 실패 (%s): %w", filepath.Base(path), err)
		}

		if _, err := db.Exec(string(content)); err != nil {
			// Skip "already exists" errors — idempotent re-runs
			if !strings.Contains(err.Error(), "already exists") {
				return fmt.Errorf("마이그레이션 실패 (%s): %w", filepath.Base(path), err)
			}
		}
		PrintInfo(fmt.Sprintf("마이그레이션: %s", filepath.Base(path)))
	}

	return nil
}

func createAdminUser(cfg StarPionConfig, email, password string) error {
	db, err := sql.Open("postgres", cfg.Database.DSN())
	if err != nil {
		return err
	}
	defer db.Close()

	// Check if admin already exists
	var count int
	_ = db.QueryRow(`SELECT COUNT(*) FROM users WHERE email = $1`, email).Scan(&count)
	if count > 0 {
		PrintInfo(fmt.Sprintf("%s 계정이 이미 존재합니다. 건너뜁니다.", email))
		return nil
	}

	// bcrypt is handled by the gateway's auth layer via crypt extension or app-level
	// Here we use pg's crypt or store plaintext to be hashed on first login.
	// For security, use a salted hash via golang.org/x/crypto/bcrypt.
	hash, err := bcryptHash(password)
	if err != nil {
		return fmt.Errorf("비밀번호 해싱 실패: %w", err)
	}

	_, err = db.Exec(`
		INSERT INTO users (email, password, role, is_active, created_at)
		VALUES ($1, $2, 'admin', true, NOW())
		ON CONFLICT (email) DO NOTHING
	`, email, hash)
	if err != nil {
		return fmt.Errorf("관리자 계정 생성 실패: %w", err)
	}
	return nil
}
