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
}

// installRoot returns the starnion data directory (~/.starnion).
// All release-installed assets (gateway binary, agent, web) live here.
func installRoot() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".starnion")
}

// isInstalled returns true when the release-installed layout is present.
func isInstalled() bool {
	_, err := os.Stat(filepath.Join(installRoot(), "agent"))
	return err == nil
}

func newUpdateCmd() *cobra.Command {
	var checkOnly bool
	var force bool
	cmd := &cobra.Command{
		Use:   "update",
		Short: "최신 버전으로 업데이트",
		Long:  "GitHub Releases에서 최신 starnion 바이너리를 다운로드하여 업데이트합니다.",
		RunE: func(cmd *cobra.Command, args []string) error {
			return runUpdate(checkOnly, force)
		},
	}
	cmd.Flags().BoolVar(&checkOnly, "check", false, "버전 확인만 하고 업데이트하지 않음")
	cmd.Flags().BoolVar(&force, "force", false, "이미 최신 버전이어도 강제 재설치")
	return cmd
}

func runUpdate(checkOnly, force bool) error {
	PrintSectionHeader(0, 0, "UPDATE")

	// ── Fetch latest release ───────────────────────────────────────────────
	PrintInfo("최신 버전 확인 중...")
	release, err := fetchLatestRelease()
	if err != nil {
		PrintFail("GitHub", fmt.Sprintf("버전 확인 실패: %v", err))
		return err
	}

	latest := strings.TrimPrefix(release.TagName, "v")
	current := Version

	PrintInfo(fmt.Sprintf("현재 버전: %s", sNebula.Render("v"+current)))
	PrintInfo(fmt.Sprintf("최신 버전: %s", sGold.Render("v"+latest)))

	// ── Compare versions ───────────────────────────────────────────────────
	if current == latest && !force {
		PrintOK("버전", "이미 최신 버전입니다.")
		PrintHint("재설치: " + sStar.Render("starnion update --force"))
		return nil
	}
	if current == latest && force {
		PrintInfo("--force: 최신 버전이지만 재설치합니다.")
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

	// ── Install runtime files (agent, web, docker, scripts) ───────────────
	if err := installRuntimeFiles(extractDir, starnionHome); err != nil {
		PrintWarn("런타임", fmt.Sprintf("일부 파일 설치 실패: %v", err))
	}

	// ── Post-install: install agent node_modules ─────────────────────────
	agentDir := filepath.Join(starnionHome, "agent")
	if _, err := os.Stat(filepath.Join(agentDir, "package.json")); err == nil {
		if err := ensureNodeModules(agentDir); err != nil {
			PrintWarn("Agent", fmt.Sprintf("의존성 설치 실패: %v", err))
		}
	}

	// ── Post-install: update systemd service files (Linux only) ──────────
	updateSystemdServices(starnionHome)

	fmt.Println()
	PrintOK("업데이트", fmt.Sprintf("StarNion v%s 설치 완료", latest))
	PrintHint("변경사항: " + release.HTMLURL)
	return nil
}

// updateSystemdServices copies service files from ~/.starnion/scripts/ to
// /etc/systemd/system/ and runs daemon-reload.
func updateSystemdServices(starnionHome string) {
	if runtime.GOOS != "linux" {
		return
	}
	scriptsDir := filepath.Join(starnionHome, "scripts")
	src := filepath.Join(scriptsDir, "starnion.service")
	data, err := os.ReadFile(src)
	if err != nil {
		return
	}
	// Replace HOME=/root with the actual home directory of the installing user.
	home, _ := os.UserHomeDir()
	if home != "" {
		data = []byte(strings.Replace(string(data), "HOME=/root", "HOME="+home, 1))
	}
	dest := filepath.Join("/etc/systemd/system", "starnion.service")
	if err := os.WriteFile(dest, data, 0o644); err != nil {
		PrintWarn("systemd", fmt.Sprintf("starnion.service 업데이트 실패: %v", err))
		return
	}
	cmd := exec.Command("systemctl", "daemon-reload") // #nosec G204
	_ = cmd.Run()
	PrintOK("systemd", "서비스 파일 업데이트 완료")
}

// currentBinaryPath returns the real path of the running starnion binary.
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

// replaceFile atomically replaces destPath with srcPath, retrying with sudo on failure.
func replaceFile(src, dest string) error {
	if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
		return err
	}
	if err := copyFile(src, dest); err == nil {
		return nil
	}
	// Fallback: sudo cp
	PrintInfo(fmt.Sprintf("권한 부족 — sudo로 재시도 중: %s", dest))
	sudoCmd := exec.Command("sudo", "cp", src, dest) // #nosec G204
	sudoCmd.Stdout = os.Stdout
	sudoCmd.Stderr = os.Stderr
	return sudoCmd.Run()
}

// copyFile copies src to dest atomically via a temp file.
func copyFile(src, dest string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

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

// installRuntimeFiles copies agent/, web/, docker/, scripts/ from extractDir into starnionHome,
// preserving any existing environment files.
func installRuntimeFiles(extractDir, starnionHome string) error {
	// agent/: replace entirely
	if agentSrc := filepath.Join(extractDir, "agent"); dirExists(agentSrc) {
		agentDst := filepath.Join(starnionHome, "agent")
		if err := os.RemoveAll(agentDst); err != nil {
			return fmt.Errorf("agent 디렉토리 제거 실패: %w", err)
		}
		if err := copyDir(agentSrc, agentDst); err != nil {
			return fmt.Errorf("agent 복사 실패: %w", err)
		}
		PrintOK("agent", fmt.Sprintf("설치 완료 → %s", agentDst))
	}

	// web/: preserve existing .env
	if webSrc := filepath.Join(extractDir, "web"); dirExists(webSrc) {
		webDst := filepath.Join(starnionHome, "web")
		var envBackup []byte
		if data, err := os.ReadFile(filepath.Join(webDst, ".env")); err == nil {
			envBackup = data
		}
		if err := os.RemoveAll(webDst); err != nil {
			return fmt.Errorf("web 디렉토리 제거 실패: %w", err)
		}
		if err := copyDir(webSrc, webDst); err != nil {
			return fmt.Errorf("web 복사 실패: %w", err)
		}
		if len(envBackup) > 0 {
			_ = os.WriteFile(filepath.Join(webDst, ".env"), envBackup, 0o600)
		}
		PrintOK("web", fmt.Sprintf("설치 완료 → %s", webDst))
	}

	// docker/: preserve existing .env
	if dockerSrc := filepath.Join(extractDir, "docker"); dirExists(dockerSrc) {
		dockerDst := filepath.Join(starnionHome, "docker")
		var envBackup []byte
		if data, err := os.ReadFile(filepath.Join(dockerDst, ".env")); err == nil {
			envBackup = data
		}
		if err := os.RemoveAll(dockerDst); err != nil {
			return fmt.Errorf("docker 디렉토리 제거 실패: %w", err)
		}
		if err := copyDir(dockerSrc, dockerDst); err != nil {
			return fmt.Errorf("docker 복사 실패: %w", err)
		}
		if len(envBackup) > 0 {
			_ = os.WriteFile(filepath.Join(dockerDst, ".env"), envBackup, 0o600)
		}
		PrintOK("docker", fmt.Sprintf("설치 완료 → %s", dockerDst))
	}

	// proto/: replace entirely (gRPC definitions needed by agent)
	if protoSrc := filepath.Join(extractDir, "proto"); dirExists(protoSrc) {
		protoDst := filepath.Join(starnionHome, "proto")
		if err := os.RemoveAll(protoDst); err != nil {
			return fmt.Errorf("proto 디렉토리 제거 실패: %w", err)
		}
		if err := copyDir(protoSrc, protoDst); err != nil {
			return fmt.Errorf("proto 복사 실패: %w", err)
		}
		PrintOK("proto", fmt.Sprintf("설치 완료 → %s", protoDst))
	}

	// scripts/: replace entirely
	if scriptsSrc := filepath.Join(extractDir, "scripts"); dirExists(scriptsSrc) {
		scriptsDst := filepath.Join(starnionHome, "scripts")
		if err := os.RemoveAll(scriptsDst); err != nil {
			return fmt.Errorf("scripts 디렉토리 제거 실패: %w", err)
		}
		if err := copyDir(scriptsSrc, scriptsDst); err != nil {
			return fmt.Errorf("scripts 복사 실패: %w", err)
		}
		PrintOK("scripts", fmt.Sprintf("설치 완료 → %s", scriptsDst))
	}

	return nil
}

func dirExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

// copyDir recursively copies src directory to dst, preserving symlinks.
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

		if info.Mode()&os.ModeSymlink != 0 {
			linkname, err := os.Readlink(path)
			if err != nil {
				return err
			}
			if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
				return err
			}
			_ = os.Remove(target)
			return os.Symlink(linkname, target)
		}
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

// downloadFile downloads url to destPath.
func downloadFile(url, destPath string) error {
	client := &http.Client{Timeout: 5 * time.Minute}
	resp, err := client.Get(url) // #nosec G107
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

// verifyChecksum checks the SHA-256 of tarballPath against checksums file.
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

// symlinkEntry holds a deferred symlink creation.
type symlinkEntry struct {
	target   string
	linkname string
}

// extractTarGz extracts a .tar.gz archive, creating symlinks in a second pass.
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

	var symlinks []symlinkEntry
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
			symlinks = append(symlinks, symlinkEntry{target: target, linkname: hdr.Linkname})
		}
	}

	// Second pass: create symlinks after all regular files are extracted.
	for _, sl := range symlinks {
		if err := os.MkdirAll(filepath.Dir(sl.target), 0o755); err != nil {
			return err
		}
		_ = os.Remove(sl.target)
		if err := os.Symlink(sl.linkname, sl.target); err != nil {
			return err
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
	req.Header.Set("User-Agent", "starnion-cli/"+Version)

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
