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
		Use:   "starnion",
		Short: "StarNion — Personal AI Assistant CLI",
		Long:  sGold.Render("★ StarNion") + " " + sNebula.Render("Personal AI Assistant"),
		// Print banner on bare `starnion` invocation
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
		newChatCmd(),
		newAuthCmd(),
		newConfigCmd(),
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

// ── config ────────────────────────────────────────────────────────────────────

func newConfigCmd() *cobra.Command {
	c := &cobra.Command{
		Use:   "config",
		Short: "서비스 설정 관리",
	}
	c.AddCommand(newConfigGoogleCmd())
	c.AddCommand(newConfigEmbeddingCmd())
	c.AddCommand(newConfigGeminiCmd())
	return c
}

func newConfigGeminiCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "gemini",
		Short: "Gemini API 키 설정 (이미지 생성, 비전, 오디오)",
		Long: "이미지 생성·분석, 오디오 처리, 리포트 생성에 사용되는 서버 공용 Gemini API 키를 설정합니다.\n" +
			"Google AI Studio (https://aistudio.google.com/apikey) 에서 발급받으세요.",
		RunE: func(cmd *cobra.Command, args []string) error {
			return RunConfigGemini()
		},
	}
}

func newConfigGoogleCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "google",
		Short: "Google OAuth2 자격증명 설정",
		Long:  "Google Calendar / Gmail / Drive 연동에 필요한 OAuth2 Client ID와 Secret을 설정합니다.",
		RunE: func(cmd *cobra.Command, args []string) error {
			return RunConfigGoogle()
		},
	}
}

func newConfigEmbeddingCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "embedding",
		Short: "임베딩 엔진 설정 (OpenAI 또는 Gemini)",
		Long: "검색 기록·문서 벡터 저장에 사용되는 서버 공용 임베딩 엔진을 설정합니다.\n" +
			"⚠  모든 사용자가 동일한 모델을 공유합니다. 변경 시 DB 재색인 필요.",
		RunE: func(cmd *cobra.Command, args []string) error {
			return RunConfigEmbedding()
		},
	}
}

// ── setup ─────────────────────────────────────────────────────────────────────

func newSetupCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "setup",
		Short: "초기 설정 마법사 실행",
		Long:  "StarNion 서비스 실행에 필요한 초기 설정을 대화형으로 진행합니다.",
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
				PrintFail("Config", "설정 파일 없음 → 'starnion setup' 실행 필요")
			}

			// PostgreSQL
			if CheckPostgres(cfg.Database.Host, cfg.Database.Port) {
				PrintOK("PostgreSQL", fmt.Sprintf("%s:%d", cfg.Database.Host, cfg.Database.Port))
			} else {
				PrintFail("PostgreSQL", "서버 미실행")
			}

			// MinIO
			if CheckMinIO(cfg.MinIO.PublicURL) {
				PrintOK("MinIO", cfg.MinIO.PublicURL)
			} else {
				PrintFail("MinIO", "서버 미실행")
			}

			// Tools
			// uv: check PATH and ~/.local/bin fallback
			if CheckCommand("uv") {
				PrintOK("uv", "설치 확인")
			} else if uvBin() != "uv" {
				PrintOK("uv", "설치 확인 (~/.local/bin/uv)")
			} else {
				PrintFail("uv", "설치되지 않음 → curl -LsSf https://astral.sh/uv/install.sh | sh")
			}
			// node: required for UI standalone
			if CheckCommand("node") {
				PrintOK("node", "설치 확인")
			} else {
				PrintFail("node", "설치되지 않음 → https://nodejs.org (v20+)")
			}
			// pnpm / go: dev mode only
			for _, tool := range []string{"pnpm", "go"} {
				if CheckCommand(tool) {
					PrintOK(tool, "설치 확인")
				} else {
					PrintFail(tool, "설치되지 않음 (개발 모드에서만 필요)")
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
				sGold.Render("★ StarNion"),
				sStar.Render("v"+version),
			)
		},
	}
}
