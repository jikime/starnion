package cli

import (
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"sync"
	"syscall"
	"time"
)

// installRoot returns the starnion data directory (~/.starnion).
// All release-installed assets (gateway binary, agent, ui) live here.
func installRoot() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".starnion")
}

// isInstalled returns true when the release-installed layout is present
// (~/.starnion/agent exists). In development the source tree is used instead.
func isInstalled() bool {
	_, err := os.Stat(filepath.Join(installRoot(), "agent"))
	return err == nil
}

// projectRoot returns the directory containing agent/, ui/, gateway/ subdirs.
// For installed binaries it returns installRoot(); for development it walks up
// from the executable until it finds the source tree.
func projectRoot() string {
	if isInstalled() {
		return installRoot()
	}
	exe, _ := os.Executable()
	dir := filepath.Dir(exe)
	for i := 0; i < 6; i++ {
		if _, err := os.Stat(filepath.Join(dir, "agent")); err == nil {
			return dir
		}
		dir = filepath.Dir(dir)
	}
	// fallback: current working directory
	wd, _ := os.Getwd()
	return wd
}

// ensureConfigured checks that setup has been run; prints hint if not.
func ensureConfigured() bool {
	if ConfigExists() {
		return true
	}
	fmt.Println()
	PrintFail("Setup", "StarNion이 설정되지 않았습니다.")
	PrintHint("먼저 'starnion setup'을 실행하세요.")
	return false
}

// ── Dependency auto-install ───────────────────────────────────────────────────

func ensureAgentDeps(root string) error {
	agentDir := filepath.Join(root, "agent")
	venvDir := filepath.Join(agentDir, ".venv")

	venvStat, venvErr := os.Stat(venvDir)
	pyprojectStat, ppErr := os.Stat(filepath.Join(agentDir, "pyproject.toml"))

	needsSync := venvErr != nil // venv doesn't exist
	if venvErr == nil && ppErr == nil {
		// venv exists but pyproject.toml is newer → re-sync
		needsSync = pyprojectStat.ModTime().After(venvStat.ModTime())
	}

	if !needsSync {
		return nil
	}

	// hatchling editable-install requires README.md; create an empty one if missing.
	readmePath := filepath.Join(agentDir, "README.md")
	if _, err := os.Stat(readmePath); os.IsNotExist(err) {
		_ = os.WriteFile(readmePath, []byte("# starnion-agent\n"), 0o644)
	}

	PrintInfo("Python 패키지 설치 중... (uv sync)")
	cmd := exec.Command(uvBin(), "sync")
	cmd.Dir = agentDir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

func ensureUIDeps(root string) error {
	uiDir := filepath.Join(root, "ui")
	nmDir := filepath.Join(uiDir, "node_modules")

	nmStat, nmErr := os.Stat(nmDir)
	lockStat, lockErr := os.Stat(filepath.Join(uiDir, "pnpm-lock.yaml"))

	needsInstall := nmErr != nil // node_modules doesn't exist
	if nmErr == nil && lockErr == nil {
		// node_modules exists but lock file is newer
		needsInstall = lockStat.ModTime().After(nmStat.ModTime())
	}

	if !needsInstall {
		return nil
	}

	PrintInfo("Node.js 패키지 설치 중... (pnpm install)")
	cmd := exec.Command("pnpm", "install")
	cmd.Dir = uiDir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

// ── Service launchers ─────────────────────────────────────────────────────────

// serviceCmd builds an *exec.Cmd with stdout/stderr connected to the terminal.
func serviceCmd(dir, colorPrefix string, name string, args ...string) *exec.Cmd {
	cmd := exec.Command(name, args...)
	cmd.Dir = dir
	cmd.Stdout = newPrefixWriter(os.Stdout, colorPrefix)
	cmd.Stderr = newPrefixWriter(os.Stderr, colorPrefix)
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	return cmd
}

// RunGateway starts the gateway server.
func RunGateway(devMode bool) error {
	if !ensureConfigured() {
		return nil
	}

	PrintSectionHeader(0, 0, "GATEWAY")
	PrintInfo("게이트웨이 서버를 시작합니다...")

	var cmd *exec.Cmd
	if isInstalled() {
		gwBin := filepath.Join(installRoot(), "bin", "starnion-gateway")
		cmd = serviceCmd(installRoot(), sAntares.Render("[gateway]"), gwBin)
	} else {
		root := projectRoot()
		_ = WriteEnvFilesFromConfig(root)
		gwDir := filepath.Join(root, "gateway")
		cmd = serviceCmd(gwDir, sAntares.Render("[gateway]"), "go", "run", "./cmd/gateway")
	}

	return runWithSignal(cmd)
}

// RunAgent ensures Python deps and starts the agent.
func RunAgent() error {
	if !ensureConfigured() {
		return nil
	}

	PrintSectionHeader(0, 0, "AGENT")

	root := projectRoot()
	if err := ensureAgentDeps(root); err != nil {
		return fmt.Errorf("agent 패키지 설치 실패: %w", err)
	}

	PrintInfo("에이전트를 시작합니다...")
	agentDir := filepath.Join(root, "agent")
	cmd := serviceCmd(agentDir, sCrimson.Render("[agent]"), uvBin(), "run", "python", "-m", "starnion_agent")
	return runWithSignal(cmd)
}

// ensureNodeInstalled checks that `node` is available and prints a helpful
// error with installation instructions if it is not.
func ensureNodeInstalled() bool {
	if _, err := exec.LookPath("node"); err == nil {
		return true
	}
	fmt.Println()
	PrintFail("Node.js", "node 명령을 찾을 수 없습니다.")
	PrintHint("Node.js를 설치하세요:")
	PrintHint("  Ubuntu/Debian : sudo apt install -y nodejs")
	PrintHint("  RHEL/Rocky    : sudo dnf install -y nodejs")
	PrintHint("  macOS (brew)  : brew install node")
	PrintHint("  또는 https://nodejs.org 에서 최신 버전을 설치하세요.")
	return false
}

// RunUI ensures Node deps and starts the UI.
func RunUI(devMode bool) error {
	if !ensureConfigured() {
		return nil
	}

	PrintSectionHeader(0, 0, "UI")
	PrintInfo("UI를 시작합니다...")

	var cmd *exec.Cmd
	if isInstalled() {
		if !ensureNodeInstalled() {
			return nil
		}
		// Installed: run Next.js standalone server; env vars are loaded from
		// ~/.starnion/ui/.env which WriteEnvFilesFromConfig writes.
		uiDir := filepath.Join(installRoot(), "ui")
		_ = WriteEnvFilesFromConfig(installRoot())
		cmd = serviceCmd(uiDir, sGold.Render("[ui]"), "node", "server.js")
	} else {
		root := projectRoot()
		_ = WriteEnvFilesFromConfig(root)
		uiDir := filepath.Join(root, "ui")
		if err := ensureUIDeps(root); err != nil {
			return fmt.Errorf("UI 패키지 설치 실패: %w", err)
		}
		pnpmCmd := "start"
		if devMode {
			pnpmCmd = "dev"
		}
		cmd = serviceCmd(uiDir, sGold.Render("[ui]"), "pnpm", pnpmCmd)
	}
	return runWithSignal(cmd)
}

// RunDev starts all three services concurrently.
// One service exiting causes the others to be terminated.
func RunDev() error {
	if !ensureConfigured() {
		return nil
	}

	root := projectRoot()

	var cmds []*exec.Cmd
	if isInstalled() {
		if !ensureNodeInstalled() {
			return nil
		}
		_ = WriteEnvFilesFromConfig(installRoot())
		agentDir := filepath.Join(root, "agent")
		uiDir := filepath.Join(root, "ui")
		gwBin := filepath.Join(installRoot(), "bin", "starnion-gateway")
		if err := ensureAgentDeps(root); err != nil {
			return fmt.Errorf("agent 패키지 설치 실패: %w", err)
		}
		cmds = []*exec.Cmd{
			serviceCmd(installRoot(), sAntares.Render("[gateway]"), gwBin),
			serviceCmd(agentDir, sCrimson.Render("[agent] "), uvBin(), "run", "python", "-m", "starnion_agent"),
			serviceCmd(uiDir, sGold.Render("[ui]     "), "node", "server.js"),
		}
	} else {
		_ = WriteEnvFilesFromConfig(root)
		if err := ensureAgentDeps(root); err != nil {
			return fmt.Errorf("agent 패키지 설치 실패: %w", err)
		}
		if err := ensureUIDeps(root); err != nil {
			return fmt.Errorf("UI 패키지 설치 실패: %w", err)
		}
		gwDir := filepath.Join(root, "gateway")
		agentDir := filepath.Join(root, "agent")
		uiDir := filepath.Join(root, "ui")
		cmds = []*exec.Cmd{
			serviceCmd(gwDir, sAntares.Render("[gateway]"), "go", "run", "./cmd/gateway"),
			serviceCmd(agentDir, sCrimson.Render("[agent] "), uvBin(), "run", "python", "-m", "starnion_agent"),
			serviceCmd(uiDir, sGold.Render("[ui]     "), "pnpm", "dev"),
		}
	}

	PrintSectionHeader(0, 0, "DEV MODE  ·  gateway + agent + ui")
	PrintInfo("Ctrl+C로 모든 서비스를 종료합니다.")
	fmt.Println()

	// Start all
	for _, cmd := range cmds {
		if err := cmd.Start(); err != nil {
			killAll(cmds)
			return fmt.Errorf("서비스 시작 실패: %w", err)
		}
	}

	// Wait for Ctrl+C or any process exit
	done := make(chan error, len(cmds))
	var wg sync.WaitGroup
	for _, cmd := range cmds {
		wg.Add(1)
		c := cmd
		go func() {
			defer wg.Done()
			done <- c.Wait()
		}()
	}

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)

	select {
	case <-sig:
		PrintInfo("종료 신호 수신 — 서비스를 종료합니다...")
	case err := <-done:
		if err != nil {
			PrintFail("서비스", err.Error())
		}
		PrintInfo("서비스가 종료되었습니다. 나머지 서비스를 종료합니다...")
	}

	killAll(cmds)
	wg.Wait()
	return nil
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func runWithSignal(cmd *exec.Cmd) error {
	if err := cmd.Start(); err != nil {
		return err
	}

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)

	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()

	select {
	case <-sig:
		_ = syscall.Kill(-cmd.Process.Pid, syscall.SIGTERM)
		time.Sleep(500 * time.Millisecond)
	case err := <-done:
		return err
	}
	return nil
}

func killAll(cmds []*exec.Cmd) {
	for _, cmd := range cmds {
		if cmd.Process != nil {
			_ = syscall.Kill(-cmd.Process.Pid, syscall.SIGTERM)
		}
	}
}

// WriteEnvFilesFromConfig loads config and regenerates the UI .env file.
func WriteEnvFilesFromConfig(root string) error {
	cfg, err := LoadConfig()
	if err != nil {
		return err
	}
	return WriteUIEnv(cfg, root)
}
