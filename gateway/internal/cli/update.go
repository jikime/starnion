package cli

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/spf13/cobra"
)

const (
	githubRepo   = "jikime/starnion"
	installShURL = "https://jikime.github.io/starnion/install.sh"
)

// githubRelease is the minimal subset of the GitHub releases API response.
type githubRelease struct {
	TagName string `json:"tag_name"`
	Name    string `json:"name"`
	HTMLURL string `json:"html_url"`
	Body    string `json:"body"`
}

func newUpdateCmd() *cobra.Command {
	var checkOnly bool
	var skipDocker bool
	cmd := &cobra.Command{
		Use:   "update",
		Short: "최신 버전으로 업데이트",
		Long:  "GitHub Releases에서 최신 starnion 바이너리를 다운로드하여 업데이트합니다.\nDocker로 실행 중인 경우 이미지도 함께 갱신합니다.",
		RunE: func(cmd *cobra.Command, args []string) error {
			return runUpdate(checkOnly, skipDocker)
		},
	}
	cmd.Flags().BoolVar(&checkOnly, "check", false, "버전 확인만 하고 업데이트하지 않음")
	cmd.Flags().BoolVar(&skipDocker, "skip-docker", false, "Docker 이미지 갱신 건너뜀")
	return cmd
}

func runUpdate(checkOnly bool, skipDocker bool) error {
	PrintSectionHeader(0, 0, "UPDATE")

	// ── Fetch latest release ───────────────────────────────────────────────
	PrintInfo("최신 버전 확인 중...")
	release, err := fetchLatestRelease()
	if err != nil {
		PrintFail("GitHub", fmt.Sprintf("버전 확인 실패: %v", err))
		return err
	}

	latest := strings.TrimPrefix(release.TagName, "v")
	current := version

	PrintInfo(fmt.Sprintf("현재 버전: %s", sNebula.Render("v"+current)))
	PrintInfo(fmt.Sprintf("최신 버전: %s", sGold.Render("v"+latest)))

	// ── Compare versions ───────────────────────────────────────────────────
	if current == latest {
		PrintOK("버전", "이미 최신 버전입니다.")
		return nil
	}

	if current == "dev" {
		PrintInfo("개발 빌드(dev)입니다. 정식 릴리즈로 교체합니다.")
	}

	if checkOnly {
		fmt.Println()
		PrintHint("업데이트 명령: " + sStar.Render("starnion update"))
		return nil
	}

	// ── Confirm OS/arch support ────────────────────────────────────────────
	goos := runtime.GOOS
	goarch := runtime.GOARCH
	if goos != "darwin" && goos != "linux" {
		PrintFail("OS", fmt.Sprintf("자동 업데이트는 macOS/Linux만 지원합니다. (현재: %s)", goos))
		PrintHint("수동 다운로드: " + release.HTMLURL)
		return nil
	}
	if goarch != "amd64" && goarch != "arm64" {
		PrintFail("Arch", fmt.Sprintf("자동 업데이트는 amd64/arm64만 지원합니다. (현재: %s)", goarch))
		PrintHint("수동 다운로드: " + release.HTMLURL)
		return nil
	}

	// ── Run install.sh ─────────────────────────────────────────────────────
	PrintInfo(fmt.Sprintf("v%s → v%s 업데이트 시작...", current, latest))

	// Download install.sh and pipe to bash
	sh, err := fetchInstallScript()
	if err != nil {
		// Fallback: tell user to run curl manually
		PrintFail("다운로드", err.Error())
		PrintHint("수동 업데이트:")
		PrintHint("  " + sCrimson.Render("curl -fsSL "+installShURL+" | bash"))
		return nil
	}

	bashCmd := exec.Command("bash", "-s")
	bashCmd.Stdin = strings.NewReader(sh)
	bashCmd.Stdout = os.Stdout
	bashCmd.Stderr = os.Stderr
	bashCmd.Env = append(os.Environ(),
		"STARNION_VERSION="+latest,
		"NO_PROMPT=1",
	)

	if err := bashCmd.Run(); err != nil {
		PrintFail("업데이트", err.Error())
		return err
	}

	fmt.Println()
	PrintOK("업데이트", fmt.Sprintf("StarNion v%s 설치 완료", latest))
	PrintHint("변경사항: " + release.HTMLURL)

	// ── Docker image pull (if running) ─────────────────────────────────────
	if !skipDocker {
		runDockerUpdate()
	}

	return nil
}

// runDockerUpdate pulls latest images and restarts if Docker services are running.
func runDockerUpdate() {
	dockerDir := dockerDirPath()
	if dockerDir == "" {
		return
	}

	// Check if any starnion containers are running
	checkCmd := exec.Command("docker", "ps", "--filter", "name=starnion-", "--format", "{{.Names}}")
	out, err := checkCmd.Output()
	if err != nil || len(out) == 0 {
		return // Docker not running or no starnion containers
	}

	PrintInfo("Docker 이미지 갱신 중...")
	pullCmd := exec.Command("docker", "compose", "pull")
	pullCmd.Dir = dockerDir
	pullCmd.Stdout = os.Stdout
	pullCmd.Stderr = os.Stderr
	if err := pullCmd.Run(); err != nil {
		PrintWarn("Docker", fmt.Sprintf("이미지 풀 실패: %v", err))
		return
	}

	PrintInfo("Docker 서비스 재시작 중...")
	upCmd := exec.Command("docker", "compose", "up", "-d", "--remove-orphans")
	upCmd.Dir = dockerDir
	upCmd.Stdout = os.Stdout
	upCmd.Stderr = os.Stderr
	if err := upCmd.Run(); err != nil {
		PrintWarn("Docker", fmt.Sprintf("서비스 재시작 실패: %v", err))
		return
	}

	// Run migrations after update
	PrintInfo("DB 마이그레이션 실행 중...")
	cfg, err := LoadConfig()
	if err == nil {
		if err := connectAndMigrate(cfg, projectRoot()); err != nil {
			PrintWarn("migrate", fmt.Sprintf("마이그레이션 실패: %v", err))
		} else {
			PrintOK("migrate", "마이그레이션 완료")
		}
	}

	PrintOK("Docker", "이미지 갱신 및 재시작 완료")
}

func dockerDirPath() string {
	root := projectRoot()
	dir := filepath.Join(root, "docker")
	if _, err := os.Stat(filepath.Join(dir, "docker-compose.yml")); err != nil {
		return ""
	}
	return dir
}

func fetchLatestRelease() (*githubRelease, error) {
	url := fmt.Sprintf("https://api.github.com/repos/%s/releases/latest", githubRepo)

	client := &http.Client{Timeout: 10 * time.Second}
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "starnion-cli/"+version)

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("네트워크 오류: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GitHub API 오류: %s", resp.Status)
	}

	var rel githubRelease
	if err := json.NewDecoder(resp.Body).Decode(&rel); err != nil {
		return nil, fmt.Errorf("응답 파싱 실패: %w", err)
	}
	if rel.TagName == "" {
		return nil, fmt.Errorf("릴리즈 태그를 찾을 수 없습니다")
	}
	return &rel, nil
}

func fetchInstallScript() (string, error) {
	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Get(installShURL)
	if err != nil {
		return "", fmt.Errorf("install.sh 다운로드 실패: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("install.sh 응답 오류: %s", resp.Status)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("install.sh 읽기 실패: %w", err)
	}
	return string(body), nil
}
