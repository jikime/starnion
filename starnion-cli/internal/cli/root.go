package cli

import (
	"fmt"
	"net"
	"os"
	"time"

	"github.com/spf13/cobra"
)

// version is set at build time via -ldflags "-X github.com/newstarnion/starnion-cli/internal/cli.Version=x.y.z"
var Version = "dev"

// NewRootCmd constructs the root cobra command with all subcommands registered.
func NewRootCmd() *cobra.Command {
	root := &cobra.Command{
		Use:   "starnion",
		Short: "StarNion — Personal AI Assistant CLI",
		Long:  sGold.Render("★ StarNion") + " " + sNebula.Render("Personal AI Assistant"),
		Run: func(cmd *cobra.Command, args []string) {
			PrintBanner(Version)
			_ = cmd.Help()
		},
	}

	root.SetOut(os.Stdout)
	root.SetErr(os.Stderr)
	root.CompletionOptions.DisableDefaultCmd = true

	root.AddCommand(
		newSetupCmd(),
		newConfigCmd(),
		newDoctorCmd(),
		newVersionCmd(),
		newLoginCmd(),
		newLogoutCmd(),
		newWhoAmICmd(),
		newChatCmd(),
		newStartCmd(),
		newDevCmd(),
		newDockerCmd(),
		newUpdateCmd(),
	)

	return root
}

// ── setup ─────────────────────────────────────────────────────────────────────

func newSetupCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "setup",
		Short: "초기 설정 마법사 실행",
		Long:  "StarNion 서비스 실행에 필요한 초기 설정을 대화형으로 진행합니다.",
		RunE: func(cmd *cobra.Command, args []string) error {
			return RunSetup()
		},
	}
}

// ── config ────────────────────────────────────────────────────────────────────

func newConfigCmd() *cobra.Command {
	c := &cobra.Command{
		Use:   "config",
		Short: "서비스 설정 관리",
		Long:  "특정 서비스 설정을 대화형으로 변경합니다.",
	}
	c.AddCommand(
		newConfigModelsCmd(),
		newConfigEmbeddingCmd(),
	)
	return c
}

func newConfigModelsCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "models",
		Short: "AI 모델 기본값 설정",
		Long:  "용도별 기본 AI 모델 (chat / report / diary / goals / finance) 을 설정합니다.",
		RunE: func(cmd *cobra.Command, args []string) error {
			return RunConfigModels()
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

// ── doctor ───────────────────────────────────────────────────────────────────

func newDoctorCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "doctor",
		Short: "시스템 의존성 및 설정 상태 점검",
		Run: func(cmd *cobra.Command, args []string) {
			PrintBanner(Version)
			PrintSectionHeader(0, 0, "DOCTOR")

			cfg, _ := LoadConfig()

			// Config file
			if ConfigExists() {
				PrintOK("Config", ConfigPath())
			} else {
				PrintFail("Config", "설정 파일 없음 → 'starnion setup' 실행 필요")
			}

			// PostgreSQL
			addr := fmt.Sprintf("%s:%d", cfg.Database.Host, cfg.Database.Port)
			conn, err := net.DialTimeout("tcp", addr, 2*time.Second)
			if err == nil {
				conn.Close()
				PrintOK("PostgreSQL", addr)
			} else {
				PrintFail("PostgreSQL", addr+" 연결 실패")
			}

			// MinIO
			if checkMinIO(cfg.Minio.PublicURL) {
				PrintOK("MinIO", cfg.Minio.PublicURL)
			} else {
				PrintFail("MinIO", cfg.Minio.PublicURL+" 연결 실패")
			}

			// Auth secrets
			if cfg.Auth.JWTSecret != "" && cfg.Auth.JWTSecret != "change-me-in-production" {
				PrintOK("JWT Secret", "설정됨")
			} else {
				PrintWarn("JWT Secret", "기본값 사용 중 — 'starnion setup'으로 재설정 권장")
			}

			// Model defaults
			d := cfg.Models.Defaults
			PrintOK("Model / Chat", d.Chat)
			PrintOK("Model / Report", d.Report)

			// Embedding
			if cfg.Embedding.APIKey != "" {
				PrintOK("Embedding", fmt.Sprintf("%s / %s", cfg.Embedding.Provider, cfg.Embedding.Model))
			} else {
				PrintInfo("Embedding — 미설정 (선택 사항)")
			}

			// Agent gRPC
			agentAddr := fmt.Sprintf("localhost:%d", cfg.Gateway.GRPCPort)
			agentConn, agentErr := net.DialTimeout("tcp", agentAddr, 2*time.Second)
			if agentErr == nil {
				agentConn.Close()
				PrintOK("Agent gRPC", agentAddr)
			} else {
				PrintWarn("Agent gRPC", agentAddr+" 응답 없음 — Agent 서비스가 실행 중인지 확인하세요")
			}

			// Telegram
			if cfg.Telegram.BotToken != "" {
				PrintOK("Telegram", "봇 토큰 설정됨")
			} else {
				PrintInfo("Telegram — 미설정 (선택 사항)")
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
				sStar.Render("v"+Version),
			)
		},
	}
}
