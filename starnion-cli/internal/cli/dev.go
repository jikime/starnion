package cli

import (
	"bufio"
	"fmt"
	"io"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"sync"
	"syscall"

	"github.com/charmbracelet/lipgloss"
	"github.com/spf13/cobra"
)

// ── Styles ────────────────────────────────────────────────────────────────────

var (
	styleDevAgent   = lipgloss.NewStyle().Foreground(lipgloss.Color(colorNebula)).Bold(true)
	styleDevGateway = lipgloss.NewStyle().Foreground(lipgloss.Color(colorGold)).Bold(true)
	styleDevWeb     = lipgloss.NewStyle().Foreground(lipgloss.Color(colorSuccess)).Bold(true)
	styleDevDB      = lipgloss.NewStyle().Foreground(lipgloss.Color(colorAntares)).Bold(true)
)

// ── Types ─────────────────────────────────────────────────────────────────────

type devService struct {
	label string
	dir   string
	bin   string
	args  []string
	style lipgloss.Style
}

// ── cobra command ─────────────────────────────────────────────────────────────

func newDevCmd() *cobra.Command {
	var noDB bool
	cmd := &cobra.Command{
		Use:   "dev",
		Short: "모든 서비스 동시 실행 (Agent · Gateway · Web)",
		Long: "Agent(gRPC), Gateway(HTTP), Web(Next.js)를 동시에 실행합니다.\n" +
			"Ctrl+C로 모든 서비스를 종료합니다.",
		RunE: func(cmd *cobra.Command, args []string) error {
			return runDev(noDB)
		},
	}
	cmd.Flags().BoolVar(&noDB, "no-db", false, "PostgreSQL docker-compose 실행 생략")
	return cmd
}

// ── main logic ────────────────────────────────────────────────────────────────

func runDev(noDB bool) error {
	root := findDevRoot()
	if root == "" {
		return fmt.Errorf("프로젝트 루트(go.work)를 찾을 수 없습니다")
	}

	PrintBanner(Version)
	cfg, _ := LoadConfig()

	fmt.Printf("  %s  %s\n", sGold.Render("★"), sBold.Render("StarNion Dev"))
	fmt.Printf("  %s\n\n", sNebula.Render(root))
	fmt.Printf("  %s  gRPC :%d\n", styleDevAgent.Render("● agent  "), cfg.Gateway.GRPCPort)
	fmt.Printf("  %s  HTTP :%d\n", styleDevGateway.Render("● gateway"), cfg.Gateway.Port)
	fmt.Printf("  %s  http://localhost:%d\n", styleDevWeb.Render("● web    "), cfg.UI.Port)
	fmt.Println()

	// ── Start PostgreSQL (docker-compose, detached) ───────────────────────────
	if !noDB {
		dcFile := filepath.Join(root, "docker-compose.yml")
		if _, err := os.Stat(dcFile); err == nil {
			fmt.Printf("%s  PostgreSQL 시작 중...\n", styleDevDB.Render("[db     ]"))
			out, err := exec.Command("docker-compose", "-f", dcFile, "up", "-d", "postgres").CombinedOutput()
			if err != nil {
				fmt.Printf("%s  %s\n", styleDevDB.Render("[db     ]"), sWarning.Render("docker-compose 실패: "+string(out)))
			} else {
				fmt.Printf("%s  %s\n", styleDevDB.Render("[db     ]"), sSuccess.Render("실행됨"))
			}
		}
	}

	services := []devService{
		{
			label: "agent  ",
			dir:   filepath.Join(root, "agent"),
			bin:   detectPkgManager(filepath.Join(root, "agent")),
			args:  []string{"dev"},
			style: styleDevAgent,
		},
		{
			label: "gateway",
			dir:   filepath.Join(root, "gateway"),
			bin:   "go",
			args:  []string{"run", "./cmd"},
			style: styleDevGateway,
		},
		{
			label: "web    ",
			dir:   filepath.Join(root, "web"),
			bin:   detectPkgManager(filepath.Join(root, "web")),
			args:  []string{"dev"},
			style: styleDevWeb,
		},
	}

	// ── Launch processes ──────────────────────────────────────────────────────
	var (
		mu      sync.Mutex
		procs   []*exec.Cmd
		wg      sync.WaitGroup
	)

	stopAll := func() {
		mu.Lock()
		defer mu.Unlock()
		for _, p := range procs {
			if p.Process != nil {
				p.Process.Signal(syscall.SIGTERM)
			}
		}
	}

	// Ctrl+C → graceful shutdown
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-sig
		fmt.Println()
		PrintInfo("서비스 종료 중...")
		stopAll()
	}()

	for _, svc := range services {
		wg.Add(1)
		go func(s devService) {
			defer wg.Done()
			c := exec.Command(s.bin, s.args...)
			c.Dir = s.dir

			mu.Lock()
			procs = append(procs, c)
			mu.Unlock()

			stdout, _ := c.StdoutPipe()
			stderr, _ := c.StderrPipe()

			if err := c.Start(); err != nil {
				fmt.Printf("%s  %s\n",
					s.style.Render("["+s.label+"]"),
					sError.Render("시작 실패: "+err.Error()))
				return
			}

			prefix := s.style.Render("["+s.label+"]") + "  "
			var lineWg sync.WaitGroup
			lineWg.Add(2)
			go func() { defer lineWg.Done(); pipeLines(prefix, stdout) }()
			go func() { defer lineWg.Done(); pipeLines(prefix, stderr) }()
			lineWg.Wait()

			_ = c.Wait()
		}(svc)
	}

	wg.Wait()
	fmt.Println()
	PrintInfo("모든 서비스가 종료되었습니다.")
	return nil
}

// pipeLines reads lines from r and writes them with prefix to stdout.
func pipeLines(prefix string, r io.Reader) {
	scanner := bufio.NewScanner(r)
	for scanner.Scan() {
		fmt.Printf("%s%s\n", prefix, scanner.Text())
	}
}

// detectPkgManager returns "pnpm" if pnpm-lock.yaml exists in dir, else "npm".
func detectPkgManager(dir string) string {
	if _, err := os.Stat(filepath.Join(dir, "pnpm-lock.yaml")); err == nil {
		return "pnpm"
	}
	return "npm"
}

// findDevRoot walks up from CWD looking for go.work, then falls back to
// detectProjectRoot (which walks up from the executable).
func findDevRoot() string {
	cwd, _ := os.Getwd()
	for dir := cwd; ; {
		if _, err := os.Stat(filepath.Join(dir, "go.work")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return detectProjectRoot()
}
