package cli

import (
	"bufio"
	"crypto/rand"
	"database/sql"
	"fmt"
	"os"
	"strings"
	"syscall"
	"text/tabwriter"

	_ "github.com/lib/pq"
	"github.com/spf13/cobra"
	"golang.org/x/term"
)

// newUsersCmd returns the 'starnion users' command group.
func newUsersCmd() *cobra.Command {
	c := &cobra.Command{
		Use:   "users",
		Short: "사용자 계정 관리 (list / add / remove / reset-password)",
	}
	c.AddCommand(
		newUsersListCmd(),
		newUsersAddCmd(),
		newUsersRemoveCmd(),
		newUsersResetPasswordCmd(),
	)
	return c
}

// ── list ──────────────────────────────────────────────────────────────────────

func newUsersListCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "list",
		Short: "모든 사용자 목록 출력",
		RunE: func(cmd *cobra.Command, args []string) error {
			return runUsersList()
		},
	}
}

func runUsersList() error {
	db, err := openDB()
	if err != nil {
		return err
	}
	defer db.Close()

	rows, err := db.Query(`
		SELECT id, email, display_name, role, created_at
		FROM users
		ORDER BY created_at ASC
	`)
	if err != nil {
		return fmt.Errorf("사용자 목록 조회 실패: %w", err)
	}
	defer rows.Close()

	PrintSectionHeader(0, 0, "USERS")

	w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
	fmt.Fprintln(w, "  ID\tEMAIL\tNAME\tROLE\tCREATED")
	fmt.Fprintln(w, "  ──────────────────────────────────────\t─────────────────────────\t───────────────\t─────\t──────────")

	count := 0
	for rows.Next() {
		var id, email, name, role, createdAt string
		if err := rows.Scan(&id, &email, &name, &role, &createdAt); err != nil {
			return fmt.Errorf("행 읽기 실패: %w", err)
		}
		// Truncate created_at to date only (first 10 chars of ISO timestamp).
		if len(createdAt) > 10 {
			createdAt = createdAt[:10]
		}
		fmt.Fprintf(w, "  %s\t%s\t%s\t%s\t%s\n", id, email, name, role, createdAt)
		count++
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("쿼리 오류: %w", err)
	}
	w.Flush()

	fmt.Println()
	PrintInfo(fmt.Sprintf("총 %d명", count))
	fmt.Println()
	return nil
}

// ── add ───────────────────────────────────────────────────────────────────────

func newUsersAddCmd() *cobra.Command {
	var email, password, name string
	var admin bool

	c := &cobra.Command{
		Use:   "add",
		Short: "새 사용자 계정 생성",
		RunE: func(cmd *cobra.Command, args []string) error {
			return runUsersAdd(email, password, name, admin)
		},
	}
	c.Flags().StringVar(&email, "email", "", "이메일 주소 (필수)")
	c.Flags().StringVar(&password, "password", "", "비밀번호 (필수)")
	c.Flags().StringVar(&name, "name", "", "표시 이름 (필수)")
	c.Flags().BoolVar(&admin, "admin", false, "관리자 권한 부여")
	_ = c.MarkFlagRequired("email")
	_ = c.MarkFlagRequired("password")
	_ = c.MarkFlagRequired("name")
	return c
}

func runUsersAdd(email, password, name string, admin bool) error {
	if email == "" || password == "" || name == "" {
		return fmt.Errorf("--email, --password, --name 은 필수입니다")
	}

	db, err := openDB()
	if err != nil {
		return err
	}
	defer db.Close()

	// Check for duplicate email.
	var count int
	_ = db.QueryRow(`SELECT COUNT(*) FROM users WHERE email = $1`, email).Scan(&count)
	if count > 0 {
		return fmt.Errorf("이미 존재하는 이메일입니다: %s", email)
	}

	hash, err := bcryptHash(password)
	if err != nil {
		return fmt.Errorf("비밀번호 해싱 실패: %w", err)
	}

	role := "user"
	if admin {
		role = "admin"
	}

	userID, err := generateUUID()
	if err != nil {
		return fmt.Errorf("UUID 생성 실패: %w", err)
	}

	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("트랜잭션 시작 실패: %w", err)
	}
	defer tx.Rollback() //nolint:errcheck

	if _, err := tx.Exec(`
		INSERT INTO users (id, display_name, email, password_hash, role)
		VALUES ($1, $2, $3, $4, $5)
	`, userID, name, email, hash, role); err != nil {
		return fmt.Errorf("사용자 생성 실패: %w", err)
	}

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

	fmt.Println()
	PrintOK("생성", fmt.Sprintf("%s (%s) [%s]", name, email, role))
	fmt.Println()
	return nil
}

// ── remove ────────────────────────────────────────────────────────────────────

func newUsersRemoveCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "remove EMAIL",
		Short: "사용자 계정 삭제",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			return runUsersRemove(args[0])
		},
	}
}

func runUsersRemove(email string) error {
	db, err := openDB()
	if err != nil {
		return err
	}
	defer db.Close()

	// Check that the user exists first.
	var id, name string
	if err := db.QueryRow(`SELECT id, display_name FROM users WHERE email = $1`, email).Scan(&id, &name); err != nil {
		if err == sql.ErrNoRows {
			return fmt.Errorf("사용자를 찾을 수 없습니다: %s", email)
		}
		return fmt.Errorf("사용자 조회 실패: %w", err)
	}

	fmt.Println()
	PrintWarn("경고", fmt.Sprintf("'%s (%s)' 계정을 영구 삭제합니다.", name, email))
	fmt.Print("  정말 삭제하시겠습니까? (yes/N): ")

	scanner := bufio.NewScanner(os.Stdin)
	scanner.Scan()
	answer := strings.TrimSpace(scanner.Text())

	if answer != "yes" {
		PrintInfo("취소되었습니다.")
		fmt.Println()
		return nil
	}

	if _, err := db.Exec(`DELETE FROM users WHERE email = $1`, email); err != nil {
		return fmt.Errorf("사용자 삭제 실패: %w", err)
	}

	PrintOK("삭제", fmt.Sprintf("%s (%s)", name, email))
	fmt.Println()
	return nil
}

// ── reset-password ────────────────────────────────────────────────────────────

func newUsersResetPasswordCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "reset-password EMAIL",
		Short: "사용자 비밀번호 재설정",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			return runUsersResetPassword(args[0])
		},
	}
}

func runUsersResetPassword(email string) error {
	db, err := openDB()
	if err != nil {
		return err
	}
	defer db.Close()

	// Verify the user exists.
	var count int
	_ = db.QueryRow(`SELECT COUNT(*) FROM users WHERE email = $1`, email).Scan(&count)
	if count == 0 {
		return fmt.Errorf("사용자를 찾을 수 없습니다: %s", email)
	}

	fmt.Printf("  새 비밀번호 (%s): ", email)
	passwordBytes, err := term.ReadPassword(int(syscall.Stdin))
	fmt.Println()
	if err != nil {
		return fmt.Errorf("비밀번호 입력 실패: %w", err)
	}
	password := strings.TrimSpace(string(passwordBytes))
	if password == "" {
		return fmt.Errorf("비밀번호를 입력해주세요")
	}

	hash, err := bcryptHash(password)
	if err != nil {
		return fmt.Errorf("비밀번호 해싱 실패: %w", err)
	}

	if _, err := db.Exec(`UPDATE users SET password_hash = $1 WHERE email = $2`, hash, email); err != nil {
		return fmt.Errorf("비밀번호 업데이트 실패: %w", err)
	}

	fmt.Println()
	PrintOK("비밀번호", fmt.Sprintf("%s 비밀번호가 변경되었습니다.", email))
	fmt.Println()
	return nil
}

// ── DB helper ─────────────────────────────────────────────────────────────────

func openDB() (*sql.DB, error) {
	cfg, err := LoadConfig()
	if err != nil {
		return nil, fmt.Errorf("설정 파일 로드 실패: %w", err)
	}
	db, err := sql.Open("postgres", cfg.Database.DSN())
	if err != nil {
		return nil, fmt.Errorf("DB 연결 실패: %w", err)
	}
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, fmt.Errorf("DB 접속 실패: %w\n  PostgreSQL이 실행 중인지 확인하세요.", err)
	}
	return db, nil
}

// generateUUID creates a random UUID v4.
func generateUUID() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	// Set version 4 and variant bits.
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x",
		b[0:4], b[4:6], b[6:8], b[8:10], b[10:16]), nil
}
