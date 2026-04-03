package cli

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"

	"github.com/spf13/cobra"
)

func newDockerCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "docker [args...]",
		Short: "Docker Compose 래퍼 (starnion docker up -d, down, logs ...)",
		Long: "~/.starnion/docker/docker-compose.yml 을 사용하여 Docker Compose 명령을 실행합니다.\n\n" +
			"사용 예시:\n" +
			"  starnion docker up -d          # 백그라운드 실행\n" +
			"  starnion docker up --build     # 이미지 빌드 후 실행\n" +
			"  starnion docker down           # 서비스 중지\n" +
			"  starnion docker logs -f        # 실시간 로그\n" +
			"  starnion docker ps             # 컨테이너 상태\n" +
			"  starnion docker restart        # 재시작",
		DisableFlagParsing: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			return runDocker(args)
		},
	}
	return cmd
}

func runDocker(args []string) error {
	composeFile := findComposeFile()
	if composeFile == "" {
		return fmt.Errorf("docker-compose.yml을 찾을 수 없습니다.\n" +
			"  예상 경로: ~/.starnion/docker/docker-compose.yml\n" +
			"  또는 프로젝트 루트의 docker-compose.yml")
	}

	// Resolve docker compose binary (prefer "docker compose" plugin over legacy "docker-compose").
	composeBin, composeArgs := resolveComposeBin()

	// Build full command: docker compose -f <file> <user args...>
	fullArgs := append(composeArgs, "-f", composeFile)

	// Set env-file if .env exists alongside the compose file.
	envFile := filepath.Join(filepath.Dir(composeFile), ".env")
	if _, err := os.Stat(envFile); err == nil {
		fullArgs = append(fullArgs, "--env-file", envFile)
	}

	fullArgs = append(fullArgs, args...)

	c := exec.Command(composeBin, fullArgs...)
	c.Dir = filepath.Dir(composeFile)
	c.Stdout = os.Stdout
	c.Stderr = os.Stderr
	c.Stdin = os.Stdin

	return c.Run()
}

// findComposeFile searches for docker-compose.yml in known locations.
func findComposeFile() string {
	candidates := []string{
		// 1. ~/.starnion/docker/docker-compose.yml (binary install)
		filepath.Join(starnionHome(), "docker", "docker-compose.yml"),
		// 2. Project root docker-compose.yml (source checkout)
		filepath.Join(findProjectRoot(), "docker-compose.yml"),
		// 3. Project root docker/docker-compose.yml
		filepath.Join(findProjectRoot(), "docker", "docker-compose.yml"),
	}
	for _, c := range candidates {
		if _, err := os.Stat(c); err == nil {
			return c
		}
	}
	return ""
}

// findProjectRoot walks up from CWD looking for go.work or docker-compose.yml.
func findProjectRoot() string {
	cwd, _ := os.Getwd()
	for dir := cwd; ; {
		for _, marker := range []string{"go.work", "docker-compose.yml"} {
			if _, err := os.Stat(filepath.Join(dir, marker)); err == nil {
				return dir
			}
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return cwd
}

// resolveComposeBin returns the binary and base args for docker compose.
func resolveComposeBin() (string, []string) {
	// Try "docker compose" plugin first (Docker Desktop / modern Docker).
	if dockerPath, err := exec.LookPath("docker"); err == nil {
		if err := exec.Command(dockerPath, "compose", "version").Run(); err == nil {
			return dockerPath, []string{"compose"}
		}
	}
	// Fall back to legacy docker-compose binary.
	if dcPath, err := exec.LookPath("docker-compose"); err == nil {
		return dcPath, nil
	}
	// Last resort — let it fail with a clear error.
	return "docker", []string{"compose"}
}
