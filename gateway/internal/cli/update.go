package cli

import (
	"archive/tar"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
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

const githubRepo = "jikime/starnion"

// githubRelease is the minimal subset of the GitHub releases API response.
type githubRelease struct {
	TagName string `json:"tag_name"`
	Name    string `json:"name"`
	HTMLURL string `json:"html_url"`
	Body    string `json:"body"`
}

func newUpdateCmd() *cobra.Command {
	var checkOnly bool
	cmd := &cobra.Command{
		Use:   "update",
		Short: "최신 버전으로 업데이트",
		Long:  "GitHub Releases에서 최신 starnion 바이너리를 다운로드하여 업데이트합니다.",
		RunE: func(cmd *cobra.Command, args []string) error {
			return runUpdate(checkOnly)
		},
	}
	cmd.Flags().BoolVar(&checkOnly, "check", false, "버전 확인만 하고 업데이트하지 않음")
	return cmd
}

func runUpdate(checkOnly bool) error {
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

	PrintInfo(fmt.Sprintf("v%s → v%s 업데이트 시작...", current, latest))

	// ── Download tarball ───────────────────────────────────────────────────
	assetName := fmt.Sprintf("starnion_%s_%s.tar.gz", goos, goarch)
	baseURL := fmt.Sprintf("https://github.com/%s/releases/download/v%s", githubRepo, latest)
	tarballURL := baseURL + "/" + assetName
	checksumsURL := baseURL + "/checksums.txt"

	tmpDir, err := os.MkdirTemp("", "starnion-update-*")
	if err != nil {
		return fmt.Errorf("임시 디렉토리 생성 실패: %w", err)
	}
	defer os.RemoveAll(tmpDir)

	tarballPath := filepath.Join(tmpDir, assetName)
	PrintInfo("다운로드 중...")
	PrintInfo("  " + tarballURL)
	if err := downloadFile(tarballURL, tarballPath); err != nil {
		PrintFail("다운로드", err.Error())
		return err
	}
	PrintOK("다운로드", "완료")

	// ── Verify checksum ────────────────────────────────────────────────────
	checksumsPath := filepath.Join(tmpDir, "checksums.txt")
	if err := downloadFile(checksumsURL, checksumsPath); err == nil {
		PrintInfo("체크섬 검증 중...")
		if err := verifyChecksum(checksumsPath, assetName, tarballPath); err != nil {
			PrintWarn("체크섬", fmt.Sprintf("검증 실패: %v — 계속 진행합니다", err))
		} else {
			PrintOK("체크섬", "검증 완료")
		}
	} else {
		PrintWarn("체크섬", "checksums.txt를 가져올 수 없습니다 — 건너뜀")
	}

	// ── Extract tarball ────────────────────────────────────────────────────
	extractDir := filepath.Join(tmpDir, "extracted")
	if err := os.MkdirAll(extractDir, 0o755); err != nil {
		return fmt.Errorf("추출 디렉토리 생성 실패: %w", err)
	}
	PrintInfo("압축 해제 중...")
	if err := extractTarGz(tarballPath, extractDir); err != nil {
		return fmt.Errorf("압축 해제 실패: %w", err)
	}

	// ── Install CLI binary ─────────────────────────────────────────────────
	newBinary := filepath.Join(extractDir, "starnion")
	if _, err := os.Stat(newBinary); err != nil {
		return fmt.Errorf("바이너리를 찾을 수 없습니다: %s", newBinary)
	}
	if err := os.Chmod(newBinary, 0o755); err != nil {
		return fmt.Errorf("권한 설정 실패: %w", err)
	}

	destBinary, err := currentBinaryPath()
	if err != nil {
		return fmt.Errorf("현재 바이너리 경로 확인 실패: %w", err)
	}
	PrintInfo(fmt.Sprintf("바이너리 교체 중: %s", destBinary))
	if err := replaceFile(newBinary, destBinary); err != nil {
		return fmt.Errorf("바이너리 교체 실패: %w", err)
	}
	PrintOK("바이너리", fmt.Sprintf("교체 완료 → %s", destBinary))

	// ── Install gateway binary ─────────────────────────────────────────────
	starnionHome := installRoot()
	_ = os.MkdirAll(filepath.Join(starnionHome, "bin"), 0o755)

	newGW := filepath.Join(extractDir, "starnion-gateway")
	if _, err := os.Stat(newGW); err == nil {
		_ = os.Chmod(newGW, 0o755)
		destGW := filepath.Join(starnionHome, "bin", "starnion-gateway")
		if err := replaceFile(newGW, destGW); err != nil {
			PrintWarn("gateway", fmt.Sprintf("교체 실패: %v", err))
		} else {
			PrintOK("gateway", fmt.Sprintf("교체 완료 → %s", destGW))
		}
	}

	// ── Install runtime files (agent, ui, docker) ──────────────────────────
	if err := installRuntimeFiles(extractDir, starnionHome); err != nil {
		PrintWarn("런타임", fmt.Sprintf("일부 파일 설치 실패: %v", err))
	}

	fmt.Println()
	PrintOK("업데이트", fmt.Sprintf("StarNion v%s 설치 완료", latest))
	PrintHint("변경사항: " + release.HTMLURL)

	// ── Post-install: regenerate ui/.env and run DB migrations ─────────────
	cfg, err := LoadConfig()
	if err == nil {
		root := installRoot()
		if wErr := MergeUIEnv(cfg, root); wErr != nil {
			PrintWarn("ui/.env", fmt.Sprintf("업데이트 실패: %v", wErr))
		} else {
			PrintOK("ui/.env", "업데이트 완료")
		}
		if mErr := connectAndMigrate(cfg, root); mErr != nil {
			PrintWarn("migrate", fmt.Sprintf("마이그레이션 실패: %v", mErr))
		} else {
			PrintOK("migrate", "마이그레이션 완료")
		}
	} else {
		PrintWarn("config", fmt.Sprintf("설정 파일 로드 실패: %v", err))
	}

	return nil
}

// currentBinaryPath returns the real path of the running starnion binary,
// resolving any symlinks.
func currentBinaryPath() (string, error) {
	exePath, err := os.Executable()
	if err != nil {
		return "", err
	}
	real, err := filepath.EvalSymlinks(exePath)
	if err != nil {
		return exePath, nil
	}
	return real, nil
}

// replaceFile atomically replaces destPath with srcPath.
// If the destination is not writable, it retries with sudo.
func replaceFile(src, dest string) error {
	// Ensure destination directory exists.
	if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
		return err
	}

	// Try a direct rename/copy first.
	if err := copyFile(src, dest); err == nil {
		return nil
	}

	// Fallback: use sudo cp.
	PrintInfo(fmt.Sprintf("권한 부족 — sudo로 재시도 중: %s", dest))
	cmd := exec.Command("sudo", "cp", src, dest)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("sudo cp 실패: %w", err)
	}
	return nil
}

// copyFile copies src to dest, replacing dest atomically via a temp file.
func copyFile(src, dest string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	// Write to a temp file in the same directory so rename is atomic.
	tmp, err := os.CreateTemp(filepath.Dir(dest), ".starnion-update-*")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName)

	if _, err := io.Copy(tmp, in); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Chmod(0o755); err != nil {
		tmp.Close()
		return err
	}
	tmp.Close()

	return os.Rename(tmpName, dest)
}

// installRuntimeFiles copies agent/, ui/, docker/ from extractDir into starnionHome,
// preserving any existing docker/.env.
func installRuntimeFiles(extractDir, starnionHome string) error {
	// agent/: replace entirely
	agentSrc := filepath.Join(extractDir, "agent")
	if _, err := os.Stat(agentSrc); err == nil {
		agentDst := filepath.Join(starnionHome, "agent")
		if err := os.RemoveAll(agentDst); err != nil {
			return fmt.Errorf("agent 디렉토리 제거 실패: %w", err)
		}
		if err := copyDir(agentSrc, agentDst); err != nil {
			return fmt.Errorf("agent 디렉토리 복사 실패: %w", err)
		}
		PrintOK("agent", fmt.Sprintf("설치 완료 → %s", agentDst))
	}

	// ui/: preserve existing .env
	uiSrc := filepath.Join(extractDir, "ui")
	if _, err := os.Stat(uiSrc); err == nil {
		uiDst := filepath.Join(starnionHome, "ui")

		// Backup existing .env
		var uiEnvBackup []byte
		uiEnvPath := filepath.Join(uiDst, ".env")
		if data, err := os.ReadFile(uiEnvPath); err == nil {
			uiEnvBackup = data
		}

		if err := os.RemoveAll(uiDst); err != nil {
			return fmt.Errorf("ui 디렉토리 제거 실패: %w", err)
		}
		if err := copyDir(uiSrc, uiDst); err != nil {
			return fmt.Errorf("ui 디렉토리 복사 실패: %w", err)
		}

		// Restore .env
		if len(uiEnvBackup) > 0 {
			_ = os.WriteFile(uiEnvPath, uiEnvBackup, 0o600)
		}
		PrintOK("ui", fmt.Sprintf("설치 완료 → %s", uiDst))
	}

	// docker/: preserve existing .env
	dockerSrc := filepath.Join(extractDir, "docker")
	if _, err := os.Stat(dockerSrc); err == nil {
		dockerDst := filepath.Join(starnionHome, "docker")

		// Backup existing .env
		var envBackup []byte
		envPath := filepath.Join(dockerDst, ".env")
		if data, err := os.ReadFile(envPath); err == nil {
			envBackup = data
		}

		if err := os.RemoveAll(dockerDst); err != nil {
			return fmt.Errorf("docker 디렉토리 제거 실패: %w", err)
		}
		if err := copyDir(dockerSrc, dockerDst); err != nil {
			return fmt.Errorf("docker 디렉토리 복사 실패: %w", err)
		}

		// Restore .env
		if len(envBackup) > 0 {
			_ = os.WriteFile(envPath, envBackup, 0o600)
		}
		PrintOK("docker", fmt.Sprintf("설치 완료 → %s", dockerDst))
	}

	return nil
}

// copyDir recursively copies src directory to dst.
func copyDir(src, dst string) error {
	return filepath.Walk(src, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		target := filepath.Join(dst, rel)

		if info.IsDir() {
			return os.MkdirAll(target, info.Mode())
		}

		return copyFilePerm(path, target, info.Mode())
	})
}

func copyFilePerm(src, dst string, mode os.FileMode) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return err
	}

	out, err := os.OpenFile(dst, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, mode)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, in)
	return err
}

// downloadFile downloads url to destPath, showing a simple progress indicator.
func downloadFile(url, destPath string) error {
	client := &http.Client{Timeout: 5 * time.Minute}
	resp, err := client.Get(url)
	if err != nil {
		return fmt.Errorf("다운로드 실패: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("HTTP %s: %s", resp.Status, url)
	}

	out, err := os.Create(destPath)
	if err != nil {
		return fmt.Errorf("파일 생성 실패: %w", err)
	}
	defer out.Close()

	_, err = io.Copy(out, resp.Body)
	return err
}

// verifyChecksum checks that the SHA-256 of tarballPath matches the entry
// for assetName in the checksums file at checksumsPath.
func verifyChecksum(checksumsPath, assetName, tarballPath string) error {
	data, err := os.ReadFile(checksumsPath)
	if err != nil {
		return fmt.Errorf("체크섬 파일 읽기 실패: %w", err)
	}

	var expected string
	for _, line := range strings.Split(string(data), "\n") {
		fields := strings.Fields(line)
		if len(fields) == 2 && fields[1] == assetName {
			expected = fields[0]
			break
		}
	}
	if expected == "" {
		return fmt.Errorf("체크섬 항목을 찾을 수 없습니다: %s", assetName)
	}

	f, err := os.Open(tarballPath)
	if err != nil {
		return err
	}
	defer f.Close()

	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return err
	}
	actual := hex.EncodeToString(h.Sum(nil))

	if actual != expected {
		return fmt.Errorf("체크섬 불일치 (expected %s, got %s)", expected, actual)
	}
	return nil
}

// extractTarGz extracts a .tar.gz archive into destDir.
func extractTarGz(src, destDir string) error {
	f, err := os.Open(src)
	if err != nil {
		return err
	}
	defer f.Close()

	gz, err := gzip.NewReader(f)
	if err != nil {
		return fmt.Errorf("gzip 열기 실패: %w", err)
	}
	defer gz.Close()

	tr := tar.NewReader(gz)
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return fmt.Errorf("tar 읽기 실패: %w", err)
		}

		// Security: strip path traversal
		target := filepath.Join(destDir, filepath.Clean("/"+hdr.Name)[1:])

		switch hdr.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(target, os.FileMode(hdr.Mode)|0o700); err != nil {
				return err
			}
		case tar.TypeReg:
			if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
				return err
			}
			out, err := os.OpenFile(target, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, os.FileMode(hdr.Mode))
			if err != nil {
				return err
			}
			if _, err := io.Copy(out, tr); err != nil {
				out.Close()
				return err
			}
			out.Close()
		case tar.TypeSymlink:
			// Remove existing file/symlink first
			_ = os.Remove(target)
			if err := os.Symlink(hdr.Linkname, target); err != nil {
				return err
			}
		}
	}
	return nil
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
