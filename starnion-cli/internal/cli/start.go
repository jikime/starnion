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

	"github.com/spf13/cobra"
)

func newStartCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "start",
		Short: "사전 빌드된 바이너리로 모든 서비스 실행",
		Long: "~/.starnion 에 설치된 Gateway, Agent, Web 서비스를 실행합니다.\n" +
			"Go / 소스 코드 불필요 — install.sh로 설치한 바이너리를 사용합니다.\n" +
			"Ctrl+C로 모든 서비스를 종료합니다.",
		RunE: func(cmd *cobra.Command, args []string) error {
			return runStart()
		},
	}
	return cmd
}

func runStart() error {
	home := starnionHome()
	cfg, _ := LoadConfig()

	// Verify installed components exist.
	gatewayBin := filepath.Join(home, "bin", "starnion-gateway")
	agentEntry := filepath.Join(home, "agent", "dist", "server", "index.js")
	webEntry := filepath.Join(home, "web", "server.js")

	missing := false
	for _, f := range []struct{ label, path string }{
		{"Gateway binary", gatewayBin},
		{"Agent entry", agentEntry},
		{"Web entry", webEntry},
	} {
		if _, err := os.Stat(f.path); os.IsNotExist(err) {
			PrintFail(f.label, f.path+" 없음")
			missing = true
		}
	}
	if missing {
		return fmt.Errorf("필요한 파일이 없습니다. 'curl -fsSL https://jikime.github.io/starnion/install.sh | bash' 로 재설치하세요")
	}

	// Ensure agent node_modules are installed.
	agentDir := filepath.Join(home, "agent")
	if err := ensureNodeModules(agentDir); err != nil {
		return err
	}

	PrintBanner(Version)
	fmt.Printf("  %s  %s\n", sGold.Render("★"), sBold.Render("StarNion Start (binary mode)"))
	fmt.Printf("  %s\n\n", sNebula.Render(home))
	fmt.Printf("  %s  gRPC :%d\n", styleDevAgent.Render("● agent  "), cfg.Gateway.GRPCPort)
	fmt.Printf("  %s  HTTP :%d\n", styleDevGateway.Render("● gateway"), cfg.Gateway.Port)
	fmt.Printf("  %s  %s\n", styleDevWeb.Render("● web    "), cfg.UI.UIURL())
	fmt.Println()

	// Build environment from starnion.yaml for each service.
	dbURL := fmt.Sprintf("postgres://%s:%s@%s:%d/%s?sslmode=%s",
		cfg.Database.User, cfg.Database.Password,
		cfg.Database.Host, cfg.Database.Port,
		cfg.Database.Name, cfg.Database.SSLMode)

	cfg.Minio.DeriveEndpoint()

	// Prepend StarNion venv to PATH so skill scripts use the isolated Python.
	venvBin := filepath.Join(home, "venv", "bin")
	currentPath := os.Getenv("PATH")
	if _, err := os.Stat(venvBin); err == nil {
		currentPath = venvBin + ":" + currentPath
	}

	commonEnv := append(os.Environ(),
		"PATH="+currentPath,
		"DATABASE_URL="+dbURL,
		"JWT_SECRET="+cfg.Auth.JWTSecret,
		"ENCRYPTION_KEY="+cfg.Auth.EncryptionKey,
		"INTERNAL_LOG_SECRET="+cfg.Auth.InternalLogSecret,
		"MINIO_ENDPOINT="+cfg.Minio.Endpoint,
		"MINIO_ACCESS_KEY="+cfg.Minio.AccessKey,
		"MINIO_SECRET_KEY="+cfg.Minio.SecretKey,
		"MINIO_BUCKET="+cfg.Minio.Bucket,
		"MINIO_PUBLIC_URL="+cfg.Minio.PublicURL,
		fmt.Sprintf("MINIO_USE_SSL=%v", cfg.Minio.UseSSL),
	)

	services := []startService{
		{
			label: "agent  ",
			bin:   "node",
			args:  []string{agentEntry},
			dir:   filepath.Join(home, "agent"),
			env: append(commonEnv,
				fmt.Sprintf("AGENT_GRPC_PORT=%d", cfg.Gateway.GRPCPort),
				fmt.Sprintf("GATEWAY_HTTP_URL=http://localhost:%d", cfg.Gateway.Port),
				fmt.Sprintf("GATEWAY_INTERNAL_URL=http://localhost:%d", cfg.Gateway.Port),
			),
			style: styleDevAgent,
		},
		{
			label: "gateway",
			bin:   gatewayBin,
			args:  nil,
			dir:   home,
			env: append(commonEnv,
				fmt.Sprintf("GATEWAY_HTTP_ADDR=:%d", cfg.Gateway.Port),
				fmt.Sprintf("AGENT_GRPC_ADDR=localhost:%d", cfg.Gateway.GRPCPort),
				fmt.Sprintf("PUBLIC_URL=http://localhost:%d", cfg.Gateway.Port),
				"ALLOWED_ORIGINS="+cfg.UI.UIURL(),
				"SKILLS_DIR="+filepath.Join(home, "agent", "skills"),
			),
			style: styleDevGateway,
		},
		{
			label: "web    ",
			bin:   "node",
			args:  []string{webEntry},
			dir:   filepath.Join(home, "web"),
			env: append(commonEnv,
				fmt.Sprintf("PORT=%d", cfg.UI.Port),
				"HOSTNAME=0.0.0.0",
				"AUTH_SECRET="+cfg.Auth.AuthSecret,
				"NEXTAUTH_URL="+cfg.UI.UIURL(),
				"AUTH_TRUST_HOST=true",
				fmt.Sprintf("API_URL=http://localhost:%d", cfg.Gateway.Port),
				fmt.Sprintf("NEXT_PUBLIC_API_URL=http://localhost:%d", cfg.Gateway.Port),
			),
			style: styleDevWeb,
		},
	}

	var (
		mu    sync.Mutex
		procs []*exec.Cmd
		wg    sync.WaitGroup
	)

	stopAll := func() {
		mu.Lock()
		defer mu.Unlock()
		for _, p := range procs {
			if p.Process != nil {
				_ = p.Process.Signal(syscall.SIGTERM)
			}
		}
	}

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
		go func(s startService) {
			defer wg.Done()
			c := exec.Command(s.bin, s.args...)
			c.Dir = s.dir
			c.Env = s.env

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
			go func() { defer lineWg.Done(); startPipeLines(prefix, stdout) }()
			go func() { defer lineWg.Done(); startPipeLines(prefix, stderr) }()
			lineWg.Wait()

			_ = c.Wait()
		}(svc)
	}

	wg.Wait()
	fmt.Println()
	PrintInfo("모든 서비스가 종료되었습니다.")
	return nil
}

type startService struct {
	label string
	bin   string
	args  []string
	dir   string
	env   []string
	style interface{ Render(...string) string }
}

func startPipeLines(prefix string, r io.Reader) {
	scanner := bufio.NewScanner(r)
	for scanner.Scan() {
		fmt.Printf("%s%s\n", prefix, scanner.Text())
	}
}

// starnionHome returns ~/.starnion.
func starnionHome() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".starnion")
}
