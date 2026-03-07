package cli

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

// version is set at build time via -ldflags "-X ...cli.version=x.y.z"
var version = "dev"

// NewRootCmd constructs the root cobra command with all subcommands registered.
func NewRootCmd() *cobra.Command {
	root := &cobra.Command{
		Use:   "starpion",
		Short: "StarPion — Personal AI Assistant CLI",
		Long:  sGold.Render("★ StarPion") + " " + sNebula.Render("Personal AI Assistant"),
		// Print banner on bare `starpion` invocation
		Run: func(cmd *cobra.Command, args []string) {
			PrintBanner(version)
			_ = cmd.Help()
		},
	}

	root.SetOut(os.Stdout)
	root.SetErr(os.Stderr)
	// suppress default completion command
	root.CompletionOptions.DisableDefaultCmd = true

	root.AddCommand(
		newSetupCmd(),
		newGatewayCmd(),
		newAgentCmd(),
		newUICmd(),
		newDevCmd(),
		newDockerCmd(),
		newUpdateCmd(),
		newDoctorCmd(),
		newVersionCmd(),
	)

	return root
}

// ── setup ─────────────────────────────────────────────────────────────────────

func newSetupCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "setup",
		Short: "초기 설정 마법사 실행",
		Long:  "StarPion 서비스 실행에 필요한 초기 설정을 대화형으로 진행합니다.",
		RunE: func(cmd *cobra.Command, args []string) error {
			root := projectRoot()
			return RunSetup(root)
		},
	}
}

// ── gateway ───────────────────────────────────────────────────────────────────

func newGatewayCmd() *cobra.Command {
	var devMode bool
	c := &cobra.Command{
		Use:   "gateway",
		Short: "게이트웨이 서버 실행",
		RunE: func(cmd *cobra.Command, args []string) error {
			PrintBanner(version)
			return RunGateway(devMode)
		},
	}
	c.Flags().BoolVar(&devMode, "dev", false, "개발 모드 (hot-reload)")
	return c
}

// ── agent ─────────────────────────────────────────────────────────────────────

func newAgentCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "agent",
		Short: "AI 에이전트 실행",
		RunE: func(cmd *cobra.Command, args []string) error {
			PrintBanner(version)
			return RunAgent()
		},
	}
}

// ── ui ────────────────────────────────────────────────────────────────────────

func newUICmd() *cobra.Command {
	var devMode bool
	c := &cobra.Command{
		Use:   "ui",
		Short: "웹 UI 실행",
		RunE: func(cmd *cobra.Command, args []string) error {
			PrintBanner(version)
			return RunUI(devMode)
		},
	}
	c.Flags().BoolVar(&devMode, "dev", false, "개발 모드 (next dev)")
	return c
}

// ── dev ───────────────────────────────────────────────────────────────────────

func newDevCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "dev",
		Short: "모든 서비스 동시 실행 (개발용)",
		RunE: func(cmd *cobra.Command, args []string) error {
			PrintBanner(version)
			return RunDev()
		},
	}
}

// ── doctor ───────────────────────────────────────────────────────────────────

func newDoctorCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "doctor",
		Short: "시스템 의존성 및 설정 상태 점검",
		Run: func(cmd *cobra.Command, args []string) {
			PrintBanner(version)
			PrintSectionHeader(0, 0, "DOCTOR")

			cfg, _ := LoadConfig()

			// Config file
			if ConfigExists() {
				PrintOK("Config", ConfigPath())
			} else {
				PrintFail("Config", "설정 파일 없음 → 'starpion setup' 실행 필요")
			}

			// PostgreSQL
			if CheckPostgres(cfg.Database.Host, cfg.Database.Port) {
				PrintOK("PostgreSQL", fmt.Sprintf("%s:%d", cfg.Database.Host, cfg.Database.Port))
			} else {
				PrintFail("PostgreSQL", "서버 미실행")
			}

			// MinIO
			if CheckMinIO(cfg.MinIO.Endpoint) {
				PrintOK("MinIO", cfg.MinIO.Endpoint)
			} else {
				PrintFail("MinIO", "서버 미실행")
			}

			// Tools
			for _, tool := range []string{"uv", "pnpm", "go", "node"} {
				if CheckCommand(tool) {
					PrintOK(tool, "설치 확인")
				} else {
					PrintFail(tool, "설치되지 않음")
				}
			}
			fmt.Println()
		},
	}
}

// ── version ───────────────────────────────────────────────────────────────────

func newVersionCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "version",
		Short: "버전 정보 출력",
		Run: func(cmd *cobra.Command, args []string) {
			fmt.Printf("%s %s\n",
				sGold.Render("★ StarPion"),
				sStar.Render("v"+version),
			)
		},
	}
}
