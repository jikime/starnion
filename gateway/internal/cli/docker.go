package cli

import (
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"syscall"

	"github.com/spf13/cobra"
)

// newDockerCmd builds the `starnion docker` command tree.
func newDockerCmd() *cobra.Command {
	docker := &cobra.Command{
		Use:   "docker",
		Short: "Docker Compose 기반 서비스 관리",
		Long:  "Docker Compose를 이용해 전체 스택을 컨테이너로 실행합니다.",
		Run: func(cmd *cobra.Command, args []string) {
			PrintBanner(version)
			_ = cmd.Help()
		},
	}

	docker.AddCommand(
		newDockerSetupCmd(),
		newDockerUpCmd(),
		newDockerDownCmd(),
		newDockerLogsCmd(),
		newDockerPsCmd(),
		newDockerRestartCmd(),
		newDockerExecCmd(),
	)

	return docker
}

// ── setup ─────────────────────────────────────────────────────────────────────

func newDockerSetupCmd() *cobra.Command {
	var envOnly bool
	cmd := &cobra.Command{
		Use:   "setup",
		Short: "Docker 환경 파일 생성 및 서비스 시작",
		Long:  "starnion 설정에서 docker/.env를 생성하고 setup.sh를 실행합니다.",
		RunE: func(cmd *cobra.Command, args []string) error {
			if !ensureConfigured() {
				return nil
			}
			cfg, err := LoadConfig()
			if err != nil {
				return err
			}

			root := projectRoot()
			dockerDir := filepath.Join(root, "docker")

			PrintSectionHeader(0, 0, "DOCKER SETUP")
			PrintInfo("docker/.env 생성 중...")

			if err := WriteDockerEnv(cfg, dockerDir); err != nil {
				PrintFail("env", err.Error())
				return err
			}
			PrintOK("env", filepath.Join(dockerDir, ".env"))

			if envOnly {
				return nil
			}

			// Run setup.sh for interactive setup
			setupSh := filepath.Join(dockerDir, "setup.sh")
			if _, err := os.Stat(setupSh); err != nil {
				PrintFail("setup.sh", "파일을 찾을 수 없습니다: "+setupSh)
				return err
			}

			PrintInfo("setup.sh 실행 중...")
			shCmd := exec.Command("bash", setupSh)
			shCmd.Stdout = os.Stdout
			shCmd.Stderr = os.Stderr
			shCmd.Stdin = os.Stdin
			return shCmd.Run()
		},
	}
	cmd.Flags().BoolVar(&envOnly, "env-only", false, "docker/.env만 생성하고 서비스는 시작하지 않음")
	return cmd
}

// ── up ────────────────────────────────────────────────────────────────────────

func newDockerUpCmd() *cobra.Command {
	var build bool
	var detach bool
	cmd := &cobra.Command{
		Use:   "up [services...]",
		Short: "서비스 시작",
		RunE: func(cmd *cobra.Command, args []string) error {
			if !ensureConfigured() {
				return nil
			}

			PrintBanner(version)
			PrintSectionHeader(0, 0, "DOCKER UP")

			root := projectRoot()
			dockerDir := filepath.Join(root, "docker")

			// Always refresh docker/.env from config
			cfg, _ := LoadConfig()
			if err := WriteDockerEnv(cfg, dockerDir); err != nil {
				PrintWarn("env", fmt.Sprintf("docker/.env 갱신 실패: %v", err))
			}

			dockerArgs := []string{"compose", "up"}
			if build {
				dockerArgs = append(dockerArgs, "--build")
			}
			if detach {
				dockerArgs = append(dockerArgs, "-d")
			}
			dockerArgs = append(dockerArgs, args...)

			return runDockerCompose(dockerDir, dockerArgs...)
		},
	}
	cmd.Flags().BoolVar(&build, "build", false, "시작 전 이미지 빌드")
	cmd.Flags().BoolVarP(&detach, "detach", "d", false, "백그라운드 실행")
	return cmd
}

// ── down ──────────────────────────────────────────────────────────────────────

func newDockerDownCmd() *cobra.Command {
	var volumes bool
	cmd := &cobra.Command{
		Use:   "down",
		Short: "서비스 중지",
		RunE: func(cmd *cobra.Command, args []string) error {
			PrintSectionHeader(0, 0, "DOCKER DOWN")

			root := projectRoot()
			dockerDir := filepath.Join(root, "docker")

			dockerArgs := []string{"compose", "down"}
			if volumes {
				dockerArgs = append(dockerArgs, "--volumes")
				PrintWarn("volumes", "데이터 볼륨이 삭제됩니다!")
			}
			dockerArgs = append(dockerArgs, args...)

			return runDockerCompose(dockerDir, dockerArgs...)
		},
	}
	cmd.Flags().BoolVarP(&volumes, "volumes", "v", false, "데이터 볼륨까지 삭제 (주의: 데이터 손실)")
	return cmd
}

// ── logs ──────────────────────────────────────────────────────────────────────

func newDockerLogsCmd() *cobra.Command {
	var follow bool
	var tail int
	cmd := &cobra.Command{
		Use:   "logs [services...]",
		Short: "서비스 로그 확인",
		RunE: func(cmd *cobra.Command, args []string) error {
			root := projectRoot()
			dockerDir := filepath.Join(root, "docker")

			dockerArgs := []string{"compose", "logs"}
			if follow {
				dockerArgs = append(dockerArgs, "-f")
			}
			if tail > 0 {
				dockerArgs = append(dockerArgs, "--tail", fmt.Sprint(tail))
			}
			dockerArgs = append(dockerArgs, args...)

			if follow {
				return runDockerComposeWithSignal(dockerDir, dockerArgs...)
			}
			return runDockerCompose(dockerDir, dockerArgs...)
		},
	}
	cmd.Flags().BoolVarP(&follow, "follow", "f", false, "로그 스트리밍")
	cmd.Flags().IntVar(&tail, "tail", 100, "출력할 최근 로그 줄 수")
	return cmd
}

// ── ps ────────────────────────────────────────────────────────────────────────

func newDockerPsCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "ps",
		Short: "실행 중인 컨테이너 목록",
		RunE: func(cmd *cobra.Command, args []string) error {
			root := projectRoot()
			dockerDir := filepath.Join(root, "docker")
			return runDockerCompose(dockerDir, "compose", "ps")
		},
	}
}

// ── restart ───────────────────────────────────────────────────────────────────

func newDockerRestartCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "restart [services...]",
		Short: "서비스 재시작",
		RunE: func(cmd *cobra.Command, args []string) error {
			root := projectRoot()
			dockerDir := filepath.Join(root, "docker")

			dockerArgs := append([]string{"compose", "restart"}, args...)
			return runDockerCompose(dockerDir, dockerArgs...)
		},
	}
}

// ── exec ──────────────────────────────────────────────────────────────────────

func newDockerExecCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "exec <service> [command...]",
		Short: "컨테이너 내부 명령 실행",
		Args:  cobra.MinimumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			root := projectRoot()
			dockerDir := filepath.Join(root, "docker")

			dockerArgs := append([]string{"compose", "exec"}, args...)
			return runDockerCompose(dockerDir, dockerArgs...)
		},
	}
}

// ── helpers ───────────────────────────────────────────────────────────────────

func dockerComposeFile(dockerDir string) string {
	return filepath.Join(dockerDir, "docker-compose.yml")
}

func runDockerCompose(dockerDir string, args ...string) error {
	if err := checkDockerCompose(); err != nil {
		return err
	}
	cmd := exec.Command("docker", args...)
	cmd.Dir = dockerDir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin
	_ = dockerComposeFile(dockerDir) // ensure path is used (validation)
	return cmd.Run()
}

func runDockerComposeWithSignal(dockerDir string, args ...string) error {
	if err := checkDockerCompose(); err != nil {
		return err
	}
	cmd := exec.Command("docker", args...)
	cmd.Dir = dockerDir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}

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
	case err := <-done:
		return err
	}
	return nil
}

func checkDockerCompose() error {
	if _, err := exec.LookPath("docker"); err != nil {
		PrintFail("Docker", "docker 명령어를 찾을 수 없습니다. Docker Desktop을 설치하세요.")
		return fmt.Errorf("docker not found")
	}
	check := exec.Command("docker", "compose", "version")
	check.Stdout = nil
	check.Stderr = nil
	if err := check.Run(); err != nil {
		PrintFail("Docker Compose", "docker compose 플러그인이 없습니다.")
		return fmt.Errorf("docker compose not available")
	}
	return nil
}
