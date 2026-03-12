package cli

import (
	"bufio"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
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

// uvBin returns the path to the uv binary.
// Checks PATH first, then ~/.local/bin/uv (uv's default install location).
func uvBin() string {
	if path, err := exec.LookPath("uv"); err == nil {
		return path
	}
	home, _ := os.UserHomeDir()
	candidate := filepath.Join(home, ".local", "bin", "uv")
	if _, err := os.Stat(candidate); err == nil {
		return candidate
	}
	return "uv" // fallback; will fail at runtime if truly absent
}

// ensureUV checks if uv is installed and installs it automatically if missing.
func ensureUV() bool {
	if CheckCommand("uv") {
		return true
	}
	// Check ~/.local/bin/uv (installed but not in PATH yet)
	home, _ := os.UserHomeDir()
	if _, err := os.Stat(filepath.Join(home, ".local", "bin", "uv")); err == nil {
		PrintOK("uv", "설치 확인 (~/.local/bin/uv)")
		return true
	}

	PrintInfo("uv가 없습니다. 자동 설치 중...")
	cmd := exec.Command("sh", "-c", "curl -LsSf https://astral.sh/uv/install.sh | sh")
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		PrintFail("uv", fmt.Sprintf("자동 설치 실패: %v", err))
		PrintHint("수동 설치: curl -LsSf https://astral.sh/uv/install.sh | sh")
		return false
	}
	PrintOK("uv", "자동 설치 완료")
	return true
}

// ── Network reachability ──────────────────────────────────────────────────────

// pingTCP returns true if host:port accepts a TCP connection within 2 s.
func pingTCP(host string, port int) bool {
	addr := net.JoinHostPort(host, fmt.Sprintf("%d", port))
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

// CheckMinIO returns true if the MinIO health endpoint responds.
// publicURL is the full base URL (e.g. "http://localhost:9000" or "https://minio.example.com").
func CheckMinIO(publicURL string) bool {
	if publicURL == "" {
		return false
	}
	base := strings.TrimRight(publicURL, "/")
	return pingHTTP(base + "/minio/health/live")
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
	UvOK   bool
	NodeOK bool
	PnpmOK bool // dev mode only
}

// RunSystemCheck performs the [1/7] system dependency check.
// Only checks tool availability (uv, node, pnpm).
// PostgreSQL and MinIO are checked AFTER the user enters their connection details.
func RunSystemCheck() SystemCheckResult {
	res := SystemCheckResult{}

	// uv ── auto-install if missing
	res.UvOK = ensureUV()

	// node ── required for UI standalone server
	res.NodeOK = CheckCommand("node")
	if res.NodeOK {
		PrintOK("node", "설치 확인")
	} else {
		PrintFail("node", "Node.js가 없습니다 → https://nodejs.org (v20+)")
	}

	// pnpm ── only needed for local dev (source tree)
	if !isInstalled() {
		res.PnpmOK = CheckCommand("pnpm")
		if res.PnpmOK {
			PrintOK("pnpm", "설치 확인")
		} else {
			PrintFail("pnpm", "설치되지 않음 → npm install -g pnpm")
		}
	}

	return res
}

// CheckPostgresWithWait checks PostgreSQL reachability at the given host:port,
// blocking until the service is available or the user gives up.
func CheckPostgresWithWait(host string, port int) {
	addr := fmt.Sprintf("%s:%d", host, port)
	PrintInfo(fmt.Sprintf("PostgreSQL 연결 확인 중... (%s)", addr))
	WaitForService(
		"PostgreSQL",
		postgresStartHint(),
		func() bool { return CheckPostgres(host, port) },
	)
	PrintOK("PostgreSQL", addr+" 연결 확인")
}
