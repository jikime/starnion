package cli

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

// selinuxFixup applies SELinux bin_t context to the given binary paths so that
// systemd can execute them from a home directory (which defaults to admin_home_t).
//
// Strategy (Linux + SELinux enforcing only):
//   - semanage available → permanent fcontext rule per directory + restorecon
//     (survives reboots, fixfiles, and future restorecon -R runs)
//   - semanage missing   → chcon -t bin_t per file (temporary; survives reboots
//     but is reset by restorecon/fixfiles)
//
// Symlinks are followed to the real binary before applying the context, which is
// required for uv-managed Python interpreters that sit at the end of a symlink chain.
func selinuxFixup(binaries []string) {
	if runtime.GOOS != "linux" {
		return
	}

	// /sys/fs/selinux/enforce: "1" = enforcing, "0" = permissive, absent = disabled.
	data, err := os.ReadFile("/sys/fs/selinux/enforce")
	if err != nil || strings.TrimSpace(string(data)) != "1" {
		return
	}

	PrintInfo("[SELinux] Enforcing 감지 → 바이너리 보안 컨텍스트 설정 중...")

	// Resolve all symlinks so we operate on the real inodes.
	seen := map[string]bool{}
	var realPaths []string
	for _, b := range binaries {
		real, err := filepath.EvalSymlinks(b)
		if err != nil {
			real = b // best-effort: use as-is
		}
		if !seen[real] {
			seen[real] = true
			realPaths = append(realPaths, real)
		}
	}

	// ── Permanent path: semanage fcontext + restorecon ────────────────────
	if _, err := exec.LookPath("semanage"); err == nil {
		// Register a bin_t fcontext rule for each unique parent directory.
		dirs := map[string]bool{}
		for _, p := range realPaths {
			dirs[filepath.Dir(p)] = true
		}
		for dir := range dirs {
			pattern := dir + "(/.*)?"
			// -a adds a new rule; if it already exists, -m modifies it.
			if err := exec.Command("semanage", "fcontext", "-a", "-t", "bin_t", pattern).Run(); err != nil {
				_ = exec.Command("semanage", "fcontext", "-m", "-t", "bin_t", pattern).Run()
			}
		}
		// Apply the registered labels to the actual files.
		failed := false
		for _, p := range realPaths {
			if out, err := exec.Command("restorecon", "-v", p).CombinedOutput(); err != nil {
				PrintWarn("[SELinux]", fmt.Sprintf("restorecon 실패 (%s): %s", p, strings.TrimSpace(string(out))))
				failed = true
			}
		}
		if !failed {
			PrintOK("[SELinux]", "bin_t 컨텍스트 영구 등록 완료 (semanage + restorecon)")
		}
		return
	}

	// ── Temporary fallback: chcon ─────────────────────────────────────────
	failed := false
	for _, p := range realPaths {
		if out, err := exec.Command("chcon", "-t", "bin_t", p).CombinedOutput(); err != nil {
			PrintWarn("[SELinux]", fmt.Sprintf("chcon 실패 (%s): %s", p, strings.TrimSpace(string(out))))
			failed = true
		}
	}
	if !failed {
		PrintOK("[SELinux]", "bin_t 컨텍스트 임시 적용 완료 (chcon)")
		PrintHint("[SELinux] 영구 적용: sudo dnf install policycoreutils-python-utils")
		PrintHint("           설치 후 starnion update --force 로 영구 등록")
	}
}
