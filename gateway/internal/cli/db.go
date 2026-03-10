package cli

import (
	"database/sql"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/spf13/cobra"

	_ "github.com/lib/pq"
)

// newDBCmd returns the "starnion db" parent command.
func newDBCmd() *cobra.Command {
	c := &cobra.Command{
		Use:   "db",
		Short: "데이터베이스 마이그레이션 관리",
	}
	c.AddCommand(newDBMigrateCmd(), newDBStatusCmd())
	return c
}

// ── migrate ───────────────────────────────────────────────────────────────────

func newDBMigrateCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "migrate",
		Short: "대기 중인 증분 마이그레이션을 모두 적용",
		RunE: func(cmd *cobra.Command, args []string) error {
			return runDBMigrate()
		},
	}
}

func runDBMigrate() error {
	cfg, err := LoadConfig()
	if err != nil {
		return fmt.Errorf("설정 로드 실패: %w", err)
	}

	db, err := sql.Open("postgres", cfg.Database.DSN())
	if err != nil {
		return fmt.Errorf("DB 연결 실패: %w", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		return fmt.Errorf("DB 접속 실패: %w", err)
	}

	// Ensure the tracking table exists (safe if already present).
	if _, err := db.Exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
		version    TEXT        NOT NULL PRIMARY KEY,
		applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	)`); err != nil {
		return fmt.Errorf("schema_migrations 테이블 확인 실패: %w", err)
	}

	files, err := listIncrementalFiles()
	if err != nil {
		return err
	}

	applied := 0
	skipped := 0

	for _, filename := range files {
		version := strings.TrimSuffix(filename, ".sql")

		var exists bool
		db.QueryRow(
			`SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version = $1)`, version,
		).Scan(&exists)

		if exists {
			fmt.Printf("  · %s 이미 적용됨\n", version)
			skipped++
			continue
		}

		content, err := migrationFS.ReadFile("migrations/incremental/" + filename)
		if err != nil {
			return fmt.Errorf("마이그레이션 파일 읽기 실패 (%s): %w", filename, err)
		}

		if _, err := db.Exec(string(content)); err != nil {
			PrintFail("Migration", fmt.Sprintf("%s 실패: %v", version, err))
			return fmt.Errorf("마이그레이션 실패 (%s): %w", version, err)
		}

		if _, err := db.Exec(
			`INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING`, version,
		); err != nil {
			return fmt.Errorf("schema_migrations 기록 실패 (%s): %w", version, err)
		}

		PrintOK("Migration", version+" 적용됨")
		applied++
	}

	fmt.Println()
	PrintInfo(fmt.Sprintf("마이그레이션 완료: %d개 적용, %d개 스킵", applied, skipped))
	return nil
}

// ── status ────────────────────────────────────────────────────────────────────

func newDBStatusCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "status",
		Short: "마이그레이션 적용 현황 표시",
		RunE: func(cmd *cobra.Command, args []string) error {
			return runDBStatus()
		},
	}
}

func runDBStatus() error {
	cfg, err := LoadConfig()
	if err != nil {
		return fmt.Errorf("설정 로드 실패: %w", err)
	}

	db, err := sql.Open("postgres", cfg.Database.DSN())
	if err != nil {
		return fmt.Errorf("DB 연결 실패: %w", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		return fmt.Errorf("DB 접속 실패: %w", err)
	}

	// Fetch all applied versions from the tracking table.
	rows, err := db.Query(`SELECT version, applied_at FROM schema_migrations ORDER BY version`)
	if err != nil {
		return fmt.Errorf("schema_migrations 조회 실패: %w", err)
	}
	defer rows.Close()

	type appliedEntry struct {
		appliedAt time.Time
	}
	appliedMap := make(map[string]appliedEntry)
	for rows.Next() {
		var ver string
		var at time.Time
		if err := rows.Scan(&ver, &at); err != nil {
			return fmt.Errorf("결과 읽기 실패: %w", err)
		}
		appliedMap[ver] = appliedEntry{appliedAt: at}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("결과 순회 오류: %w", err)
	}

	// Baseline entry (always show)
	PrintSectionHeader(0, 0, "MIGRATION STATUS")
	fmt.Println()

	if entry, ok := appliedMap["1.0.0"]; ok {
		fmt.Printf("  ✓ v1.0.0 (baseline)  [applied %s]\n",
			entry.appliedAt.Local().Format("2006-01-02 15:04:05"))
	} else {
		fmt.Println("  · v1.0.0 (baseline)  [pending]")
	}

	// Incremental files
	files, err := listIncrementalFiles()
	if err != nil {
		return err
	}

	if len(files) == 0 {
		fmt.Println()
		PrintInfo("증분 마이그레이션 파일이 없습니다.")
		return nil
	}

	for _, filename := range files {
		version := strings.TrimSuffix(filename, ".sql")
		if entry, ok := appliedMap[version]; ok {
			fmt.Printf("  ✓ %s  [applied %s]\n",
				version,
				entry.appliedAt.Local().Format("2006-01-02 15:04:05"))
		} else {
			fmt.Printf("  · %s  [pending]\n", version)
		}
	}

	fmt.Println()
	return nil
}

// ── helpers ───────────────────────────────────────────────────────────────────

// listIncrementalFiles returns sorted .sql filenames from the embedded
// migrations/incremental/ directory.  README.md and other non-.sql files are
// filtered out.  migrationFS is declared in setup.go.
func listIncrementalFiles() ([]string, error) {
	entries, err := migrationFS.ReadDir("migrations/incremental")
	if err != nil {
		// Directory may be empty or absent — not an error.
		return nil, nil
	}

	var files []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".sql") {
			files = append(files, e.Name())
		}
	}
	sort.Strings(files)
	return files, nil
}
