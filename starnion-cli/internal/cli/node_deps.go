package cli

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

// ensureNodeModules checks if node_modules exists in dir. If not, runs
// pnpm install --prod (or npm install --omit=dev as fallback) to install
// production dependencies.
func ensureNodeModules(dir string) error {
	nm := filepath.Join(dir, "node_modules")
	if _, err := os.Stat(nm); err == nil {
		return nil // already installed
	}

	PrintInfo("Agent 의존성 설치 중...")

	if pnpm, err := exec.LookPath("pnpm"); err == nil {
		cmd := exec.Command(pnpm, "install", "--prod", "--ignore-scripts")
		cmd.Dir = dir
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		if err := cmd.Run(); err != nil {
			return fmt.Errorf("pnpm install 실패: %w", err)
		}
		PrintOK("Agent", "의존성 설치 완료 (pnpm)")
		return nil
	}

	if npm, err := exec.LookPath("npm"); err == nil {
		cmd := exec.Command(npm, "install", "--omit=dev", "--ignore-scripts")
		cmd.Dir = dir
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		if err := cmd.Run(); err != nil {
			return fmt.Errorf("npm install 실패: %w", err)
		}
		PrintOK("Agent", "의존성 설치 완료 (npm)")
		return nil
	}

	return fmt.Errorf("pnpm 또는 npm이 설치되어 있지 않습니다.\n  npm install -g pnpm 후 다시 실행하세요")
}
