package cli

import (
	"bufio"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"time"
)

// ── Tool presence ─────────────────────────────────────────────────────────────

// CheckCommand returns true if the named binary exists in PATH.
func CheckCommand(name string) bool {
	_, err := exec.LookPath(name)
	return err == nil
}

// ── Network reachability ──────────────────────────────────────────────────────

// pingTCP returns true if host:port accepts a TCP connection within 2 s.
func pingTCP(host string, port int) bool {
	addr := fmt.Sprintf("%s:%d", host, port)
	conn, err := net.DialTimeout("tcp", addr, 2*time.Second)
	if err != nil {
		return false
	}
	conn.Close()
	return true
}

// pingHTTP returns true if the URL responds with status < 500 within 3 s.
func pingHTTP(url string) bool {
	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return false
	}
	resp.Body.Close()
	return resp.StatusCode < 500
}

// CheckPostgres returns true if PostgreSQL is reachable at host:port.
func CheckPostgres(host string, port int) bool {
	return pingTCP(host, port)
}

// CheckMinIO returns true if MinIO health endpoint responds at endpoint.
// endpoint is in "host:port" form.
func CheckMinIO(endpoint string) bool {
	// Try the MinIO live health endpoint (available in all MinIO versions)
	return pingHTTP("http://" + endpoint + "/minio/health/live")
}

// ── Start instructions ────────────────────────────────────────────────────────

func postgresStartHint() string {
	switch runtime.GOOS {
	case "darwin":
		return "brew services start postgresql@16\n     or: pg_ctl -D /opt/homebrew/var/postgresql@16 start"
	case "linux":
		return "sudo systemctl start postgresql\n     or: sudo service postgresql start"
	default:
		return "Start PostgreSQL via your system service manager or Docker:\n     docker compose up -d postgres"
	}
}

func minioStartHint() string {
	switch runtime.GOOS {
	case "darwin":
		return "brew services start minio\n     or: minio server ~/data --console-address :9001"
	case "linux":
		return "minio server /data --console-address :9001\n     or: sudo systemctl start minio"
	default:
		return "docker compose up -d minio"
	}
}

// ── Wait loop ─────────────────────────────────────────────────────────────────

// WaitForService repeatedly checks service availability.
// Prints instructions and waits for the user to press Enter to retry.
// Returns true once the service is up.
func WaitForService(label, hint string, check func() bool) bool {
	if check() {
		return true
	}
	for {
		PrintFail(label, "서버가 실행 중이지 않습니다")
		fmt.Printf("\n  %s\n\n", sWarning.Render("아래 명령으로 서비스를 시작하세요:"))
		for _, line := range strings.Split(hint, "\n") {
			fmt.Printf("     %s\n", sGold.Render(line))
		}
		fmt.Printf("\n  %s", sNebula.Render("시작 후 Enter를 눌러 재시도..."))
		reader := bufio.NewReader(os.Stdin)
		reader.ReadString('\n')

		if check() {
			return true
		}
	}
}

// ── Full system check ─────────────────────────────────────────────────────────

type SystemCheckResult struct {
	PostgresOK bool
	MinIOOK    bool
	UvOK       bool
	PnpmOK     bool
}

// RunSystemCheck performs the [1/5] system dependency check.
// It blocks until PostgreSQL and MinIO are reachable.
func RunSystemCheck(pgHost string, pgPort int, minioEndpoint string) SystemCheckResult {
	res := SystemCheckResult{}

	// PostgreSQL ── must be running before we proceed
	PrintInfo("PostgreSQL 확인 중...")
	res.PostgresOK = WaitForService(
		"PostgreSQL",
		postgresStartHint(),
		func() bool { return CheckPostgres(pgHost, pgPort) },
	)
	PrintOK("PostgreSQL", fmt.Sprintf("%s:%d 연결 확인", pgHost, pgPort))

	// MinIO ── must be running before we proceed
	PrintInfo("MinIO 확인 중...")
	res.MinIOOK = WaitForService(
		"MinIO",
		minioStartHint(),
		func() bool { return CheckMinIO(minioEndpoint) },
	)
	PrintOK("MinIO", minioEndpoint+" 연결 확인")

	// uv (Python package manager for agent)
	res.UvOK = CheckCommand("uv")
	if res.UvOK {
		PrintOK("uv", "설치 확인")
	} else {
		PrintFail("uv", "설치되지 않음 → curl -LsSf https://astral.sh/uv/install.sh | sh")
	}

	// pnpm (Node package manager for UI)
	res.PnpmOK = CheckCommand("pnpm")
	if res.PnpmOK {
		PrintOK("pnpm", "설치 확인")
	} else {
		PrintFail("pnpm", "설치되지 않음 → npm install -g pnpm")
	}

	return res
}
