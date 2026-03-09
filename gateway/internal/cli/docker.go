package cli

import (
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

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
		newDockerMigrateCmd(),
		newDockerBackupCmd(),
		newDockerRestoreCmd(),
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
	var prod bool
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

			composeArgs := composeFiles(dockerDir, prod)
			composeArgs = append(composeArgs, "up")
			if build {
				composeArgs = append(composeArgs, "--build")
			}
			if detach {
				composeArgs = append(composeArgs, "-d")
			}
			composeArgs = append(composeArgs, args...)

			if prod {
				PrintInfo("프로덕션 모드로 시작합니다.")
			}

			return runDockerCompose(dockerDir, composeArgs...)
		},
	}
	cmd.Flags().BoolVar(&build, "build", false, "시작 전 이미지 빌드")
	cmd.Flags().BoolVarP(&detach, "detach", "d", false, "백그라운드 실행")
	cmd.Flags().BoolVar(&prod, "prod", false, "프로덕션 설정 적용 (docker-compose.prod.yml 오버레이)")
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

// ── migrate ───────────────────────────────────────────────────────────────────

func newDockerMigrateCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "migrate",
		Short: "DB 마이그레이션 실행 (증분 스키마 적용)",
		Long:  "현재 설정의 DB에 미적용 마이그레이션을 적용합니다. setup 없이 단독 실행 가능.",
		RunE: func(cmd *cobra.Command, args []string) error {
			if !ensureConfigured() {
				return nil
			}

			PrintSectionHeader(0, 0, "DB MIGRATE")

			cfg, err := LoadConfig()
			if err != nil {
				return err
			}

			PrintInfo(fmt.Sprintf("DB: %s@%s:%d/%s",
				cfg.Database.User, cfg.Database.Host, cfg.Database.Port, cfg.Database.Name))

			root := projectRoot()
			if err := connectAndMigrate(cfg, root); err != nil {
				PrintFail("migrate", err.Error())
				return err
			}

			PrintOK("migrate", "마이그레이션 완료")
			return nil
		},
	}
}

// ── backup ────────────────────────────────────────────────────────────────────

func newDockerBackupCmd() *cobra.Command {
	var outDir string
	cmd := &cobra.Command{
		Use:   "backup",
		Short: "PostgreSQL DB + MinIO 파일 백업",
		Long:  "pg_dump으로 DB를, mc mirror로 MinIO 버킷을 로컬에 백업합니다.",
		RunE: func(cmd *cobra.Command, args []string) error {
			if !ensureConfigured() {
				return nil
			}

			PrintSectionHeader(0, 0, "BACKUP")

			cfg, err := LoadConfig()
			if err != nil {
				return err
			}

			// Default backup directory: ~/.starnion/backups/<timestamp>
			if outDir == "" {
				ts := time.Now().Format("20060102-150405")
				outDir = filepath.Join(installRoot(), "backups", ts)
			}
			if err := os.MkdirAll(outDir, 0750); err != nil {
				return fmt.Errorf("백업 디렉토리 생성 실패: %w", err)
			}

			PrintInfo(fmt.Sprintf("백업 위치: %s", outDir))

			// ── PostgreSQL dump ────────────────────────────────────────────
			PrintInfo("PostgreSQL 덤프 중...")
			dbDump := filepath.Join(outDir, "postgres.dump")
			pgDump := exec.Command("docker", "exec", "starnion-postgres",
				"pg_dump",
				"-U", cfg.Database.User,
				"-d", cfg.Database.Name,
				"-Fc", // custom format (compressed)
			)
			f, err := os.Create(dbDump)
			if err != nil {
				return fmt.Errorf("덤프 파일 생성 실패: %w", err)
			}
			pgDump.Stdout = f
			pgDump.Stderr = os.Stderr
			if err := pgDump.Run(); err != nil {
				f.Close()
				return fmt.Errorf("pg_dump 실패: %w", err)
			}
			f.Close()
			PrintOK("PostgreSQL", dbDump)

			// ── MinIO mirror ───────────────────────────────────────────────
			PrintInfo("MinIO 파일 백업 중...")
			minioDir := filepath.Join(outDir, "minio")
			if err := os.MkdirAll(minioDir, 0750); err != nil {
				return fmt.Errorf("minio 백업 디렉토리 생성 실패: %w", err)
			}

			// Use docker exec to run mc inside the minio container
			mcMirror := exec.Command("docker", "exec", "starnion-minio",
				"mc", "mirror",
				fmt.Sprintf("/data/%s", cfg.MinIO.Bucket),
				"/tmp/backup-bucket",
			)
			mcMirror.Stdout = os.Stdout
			mcMirror.Stderr = os.Stderr

			// Copy out of container
			if err := mcMirror.Run(); err != nil {
				PrintWarn("MinIO", fmt.Sprintf("mc mirror 실패 (mc 미설치 가능): %v", err))
				PrintInfo("볼륨 직접 복사로 대체합니다...")

				// Fallback: copy minio volume via docker cp
				dockerCp := exec.Command("docker", "cp",
					"starnion-minio:/data/.",
					minioDir,
				)
				dockerCp.Stdout = os.Stdout
				dockerCp.Stderr = os.Stderr
				if err := dockerCp.Run(); err != nil {
					PrintWarn("MinIO", fmt.Sprintf("docker cp도 실패: %v", err))
				} else {
					PrintOK("MinIO", minioDir)
				}
			} else {
				// Copy from container tmp to host
				dockerCp := exec.Command("docker", "cp", "starnion-minio:/tmp/backup-bucket/.", minioDir)
				dockerCp.Stdout = os.Stdout
				dockerCp.Stderr = os.Stderr
				_ = dockerCp.Run()
				PrintOK("MinIO", minioDir)
			}

			fmt.Println()
			PrintOK("backup", fmt.Sprintf("백업 완료 → %s", outDir))
			return nil
		},
	}
	cmd.Flags().StringVarP(&outDir, "out", "o", "", "백업 저장 경로 (기본: ~/.starnion/backups/<timestamp>)")
	return cmd
}

// ── restore ───────────────────────────────────────────────────────────────────

func newDockerRestoreCmd() *cobra.Command {
	var backupDir string
	var skipMinio bool
	cmd := &cobra.Command{
		Use:   "restore",
		Short: "백업에서 DB + MinIO 복원",
		Long:  "backup 명령으로 생성된 백업 디렉토리에서 DB와 파일을 복원합니다.",
		RunE: func(cmd *cobra.Command, args []string) error {
			if !ensureConfigured() {
				return nil
			}

			PrintSectionHeader(0, 0, "RESTORE")

			if backupDir == "" {
				PrintFail("restore", "--from 플래그로 백업 경로를 지정하세요.")
				PrintHint("예: starnion docker restore --from ~/.starnion/backups/20240101-120000")
				return fmt.Errorf("백업 경로 미지정")
			}

			cfg, err := LoadConfig()
			if err != nil {
				return err
			}

			// ── PostgreSQL restore ─────────────────────────────────────────
			dbDump := filepath.Join(backupDir, "postgres.dump")
			if _, err := os.Stat(dbDump); err != nil {
				return fmt.Errorf("postgres.dump를 찾을 수 없습니다: %s", dbDump)
			}

			PrintInfo("PostgreSQL 복원 중...")
			PrintWarn("주의", "기존 DB 데이터가 덮어쓰여집니다!")

			// Drop and recreate DB, then restore
			dropCmd := exec.Command("docker", "exec", "starnion-postgres",
				"dropdb", "-U", cfg.Database.User, "--if-exists", cfg.Database.Name)
			dropCmd.Stdout = os.Stdout
			dropCmd.Stderr = os.Stderr
			_ = dropCmd.Run()

			createCmd := exec.Command("docker", "exec", "starnion-postgres",
				"createdb", "-U", cfg.Database.User, cfg.Database.Name)
			createCmd.Stdout = os.Stdout
			createCmd.Stderr = os.Stderr
			if err := createCmd.Run(); err != nil {
				return fmt.Errorf("DB 재생성 실패: %w", err)
			}

			// Copy dump into container then restore
			cpCmd := exec.Command("docker", "cp", dbDump, "starnion-postgres:/tmp/restore.dump")
			cpCmd.Stdout = os.Stdout
			cpCmd.Stderr = os.Stderr
			if err := cpCmd.Run(); err != nil {
				return fmt.Errorf("덤프 파일 복사 실패: %w", err)
			}

			pgRestore := exec.Command("docker", "exec", "starnion-postgres",
				"pg_restore",
				"-U", cfg.Database.User,
				"-d", cfg.Database.Name,
				"--no-owner",
				"/tmp/restore.dump",
			)
			pgRestore.Stdout = os.Stdout
			pgRestore.Stderr = os.Stderr
			if err := pgRestore.Run(); err != nil {
				return fmt.Errorf("pg_restore 실패: %w", err)
			}
			PrintOK("PostgreSQL", "복원 완료")

			// ── MinIO restore ──────────────────────────────────────────────
			if !skipMinio {
				minioDir := filepath.Join(backupDir, "minio")
				if _, err := os.Stat(minioDir); err == nil {
					PrintInfo("MinIO 파일 복원 중...")
					dockerCp := exec.Command("docker", "cp", minioDir+"/.", "starnion-minio:/data/")
					dockerCp.Stdout = os.Stdout
					dockerCp.Stderr = os.Stderr
					if err := dockerCp.Run(); err != nil {
						PrintWarn("MinIO", fmt.Sprintf("복원 실패: %v", err))
					} else {
						PrintOK("MinIO", "복원 완료")
					}
				} else {
					PrintWarn("MinIO", "백업 디렉토리에 minio/ 없음 — 건너뜁니다.")
				}
			}

			fmt.Println()
			PrintOK("restore", "복원 완료. 서비스를 재시작하세요: starnion docker restart")
			return nil
		},
	}
	cmd.Flags().StringVar(&backupDir, "from", "", "복원할 백업 디렉토리 경로 (필수)")
	cmd.Flags().BoolVar(&skipMinio, "skip-minio", false, "MinIO 파일 복원 건너뜀 (DB만 복원)")
	return cmd
}

// ── helpers ───────────────────────────────────────────────────────────────────

// composeFiles returns the base docker compose args including -f flags.
// When prod=true, docker-compose.prod.yml is appended as an override.
func composeFiles(dockerDir string, prod bool) []string {
	args := []string{
		"compose",
		"-f", filepath.Join(dockerDir, "docker-compose.yml"),
	}
	if prod {
		prodFile := filepath.Join(dockerDir, "docker-compose.prod.yml")
		if _, err := os.Stat(prodFile); err == nil {
			args = append(args, "-f", prodFile)
		} else {
			PrintWarn("prod", "docker-compose.prod.yml을 찾을 수 없습니다. 기본 설정으로 실행합니다.")
		}
	}
	return args
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
