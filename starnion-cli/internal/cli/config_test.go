package cli

import (
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// withTempConfig points STARNION_CONFIG at an isolated temp file for
// the duration of the test so LoadConfig/SaveConfig don't clobber the
// developer's real ~/.starnion/starnion.yaml.
func withTempConfig(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	p := filepath.Join(dir, "starnion.yaml")
	t.Setenv("STARNION_CONFIG", p)
	return p
}

// TestEnsureSecrets_BackfillsBrowserAuthToken asserts that EnsureSecrets
// fills auth.browser_auth_token when a previously-generated config is
// missing the field — the exact scenario that produced the runtime
// warning `[browser] BROWSER_AUTH_TOKEN is not set ...` on older yamls.
func TestEnsureSecrets_BackfillsBrowserAuthToken(t *testing.T) {
	cfg := DefaultConfig()
	// Populate the other secrets so EnsureSecrets only fills the browser
	// token — this isolates the assertion to the field we care about.
	cfg.Auth.JWTSecret = "existing-jwt"
	cfg.Auth.AuthSecret = "existing-auth"
	cfg.Auth.EncryptionKey = "existing-enc"
	cfg.Auth.GRPCSharedSecret = "existing-grpc"
	cfg.Auth.InternalLogSecret = "existing-ilog"
	cfg.Telegram.WebhookSecret = "existing-wh"

	if cfg.Auth.BrowserAuthToken != "" {
		t.Fatalf("precondition: BrowserAuthToken should start empty")
	}
	changed := EnsureSecrets(&cfg)
	if !changed {
		t.Errorf("EnsureSecrets must report changed=true when it fills browser token")
	}
	if cfg.Auth.BrowserAuthToken == "" {
		t.Errorf("EnsureSecrets must populate auth.browser_auth_token when empty")
	}
	if len(cfg.Auth.BrowserAuthToken) != 64 {
		// 32-byte random → 64-char hex
		t.Errorf("expected 64-char hex token, got %d chars", len(cfg.Auth.BrowserAuthToken))
	}

	// Second pass must be a no-op — EnsureSecrets should only fill
	// empty fields so existing values survive across reboots.
	before := cfg.Auth.BrowserAuthToken
	if EnsureSecrets(&cfg) {
		t.Errorf("EnsureSecrets should report changed=false on a fully-filled config")
	}
	if cfg.Auth.BrowserAuthToken != before {
		t.Errorf("EnsureSecrets must not overwrite existing browser token")
	}
}

// TestLoadConfig_MigratesLegacyBrowserAuthToken asserts that a yaml
// produced by an older starnion-cli (with `browser.auth_token`) has
// its token automatically moved to `auth.browser_auth_token` on load,
// and that the legacy field is cleared so the next SaveConfig omits it.
func TestLoadConfig_MigratesLegacyBrowserAuthToken(t *testing.T) {
	p := withTempConfig(t)
	const legacyToken = "deadbeef_legacy_token_from_old_yaml"
	legacyYAML := `version: "1.0.0"
database:
  host: localhost
  port: 5432
  name: starnion
  user: postgres
  password: test
  ssl_mode: disable
auth:
  jwt_secret: existing
  auth_secret: existing
  encryption_key: existing
minio:
  access_key: ak
  secret_key: sk
  bucket: b
  public_url: http://localhost:9000
  use_ssl: false
gateway:
  port: 8080
  grpc_port: 50051
models:
  defaults:
    chat: claude
    report: claude
    diary: claude
    goals: claude
    finance: claude
browser:
  enabled: true
  auth_token: ` + legacyToken + "\n"
	if err := os.WriteFile(p, []byte(legacyYAML), 0o600); err != nil {
		t.Fatalf("seed legacy yaml: %v", err)
	}

	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("LoadConfig: %v", err)
	}
	if cfg.Auth.BrowserAuthToken != legacyToken {
		t.Errorf("expected legacy token migrated to auth.browser_auth_token, got %q", cfg.Auth.BrowserAuthToken)
	}
	if cfg.Browser.LegacyAuthToken != "" {
		t.Errorf("expected legacy field cleared in-memory, got %q", cfg.Browser.LegacyAuthToken)
	}

	// Persist and re-read: the rewritten yaml must contain the new key
	// and must NOT contain the legacy `browser: auth_token` line.
	if err := SaveConfig(cfg); err != nil {
		t.Fatalf("SaveConfig: %v", err)
	}
	raw, err := os.ReadFile(p)
	if err != nil {
		t.Fatalf("re-read yaml: %v", err)
	}
	rawStr := string(raw)
	if !strings.Contains(rawStr, "browser_auth_token: "+legacyToken) {
		t.Errorf("rewritten yaml should contain auth.browser_auth_token with legacy value, got:\n%s", rawStr)
	}
	// The legacy key is `browser.auth_token` — once migrated it must not
	// re-appear. Check for a line-anchored form because the substring
	// "auth_token: " would falsely match the prefix of "browser_auth_token:".
	for _, line := range strings.Split(rawStr, "\n") {
		trimmed := strings.TrimLeft(line, " \t")
		if strings.HasPrefix(trimmed, "auth_token:") {
			t.Errorf("rewritten yaml should NOT contain legacy browser.auth_token line, got:\n%s", rawStr)
			break
		}
	}
}

// TestLoadConfig_BackfillsMissingBrowserAuthTokenOnStart mirrors the
// `starnion dev` / `starnion start` flow for the case that originally
// triggered the warning: yaml exists, has all the OTHER secrets, but
// is missing the browser_auth_token field entirely. After EnsureSecrets
// runs and SaveConfig persists, the next LoadConfig must see the
// populated field.
func TestLoadConfig_BackfillsMissingBrowserAuthTokenOnStart(t *testing.T) {
	p := withTempConfig(t)
	noBrowserYAML := `version: "1.0.0"
database:
  host: localhost
  port: 5432
  name: starnion
  user: postgres
  password: test
  ssl_mode: disable
auth:
  jwt_secret: existing
  auth_secret: existing
  encryption_key: existing
  grpc_shared_secret: existing
  internal_log_secret: existing
minio:
  access_key: ak
  secret_key: sk
  bucket: b
  public_url: http://localhost:9000
  use_ssl: false
gateway:
  port: 8080
  grpc_port: 50051
models:
  defaults:
    chat: claude
    report: claude
    diary: claude
    goals: claude
    finance: claude
telegram:
  webhook_secret: existing
browser:
  enabled: true
`
	if err := os.WriteFile(p, []byte(noBrowserYAML), 0o600); err != nil {
		t.Fatalf("seed yaml: %v", err)
	}

	// Step 1: load — field is empty.
	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("LoadConfig: %v", err)
	}
	if cfg.Auth.BrowserAuthToken != "" {
		t.Errorf("precondition: BrowserAuthToken should be empty before EnsureSecrets")
	}

	// Step 2: run the runDev/runStart top-up flow.
	changed := EnsureSecrets(&cfg)
	if !changed {
		t.Errorf("EnsureSecrets should report changed=true when the browser token is the only missing field")
	}
	filled := cfg.Auth.BrowserAuthToken
	if filled == "" {
		t.Fatalf("EnsureSecrets should have filled browser token")
	}

	// Step 3: persist.
	if err := SaveConfig(cfg); err != nil {
		t.Fatalf("SaveConfig: %v", err)
	}

	// Step 4: re-load and confirm the value sticks.
	cfg2, err := LoadConfig()
	if err != nil {
		t.Fatalf("LoadConfig (second pass): %v", err)
	}
	if cfg2.Auth.BrowserAuthToken != filled {
		t.Errorf("browser token did not persist across reload: saved %q, reloaded %q",
			filled, cfg2.Auth.BrowserAuthToken)
	}

	// Step 5: subsequent EnsureSecrets on the re-loaded config must not
	// regenerate the token — guards against boot-loops where every
	// start would mint a fresh secret.
	if EnsureSecrets(&cfg2) {
		t.Errorf("EnsureSecrets should be a no-op on a fully-populated config")
	}
	if cfg2.Auth.BrowserAuthToken != filled {
		t.Errorf("second EnsureSecrets overwrote an existing token")
	}
}

// TestLoadConfig_RealUserYaml is an opt-in regression test that runs
// the full LoadConfig → EnsureSecrets → SaveConfig pipeline against a
// copy of an actual ~/.starnion/starnion.yaml, provided via the
// STARNION_TEST_YAML env var. Skipped by default so the unit suite
// remains hermetic. Used to sanity-check the migration path with the
// exact yaml shape the user is hitting.
//
//	STARNION_TEST_YAML=~/.starnion/starnion.yaml \
//	  go test -run TestLoadConfig_RealUserYaml ./internal/cli/...
func TestLoadConfig_RealUserYaml(t *testing.T) {
	src := os.Getenv("STARNION_TEST_YAML")
	if src == "" {
		t.Skip("STARNION_TEST_YAML not set; skipping real-yaml regression test")
	}

	dst := withTempConfig(t)
	in, err := os.Open(src)
	if err != nil {
		t.Fatalf("open source yaml: %v", err)
	}
	defer in.Close()
	out, err := os.Create(dst)
	if err != nil {
		t.Fatalf("create temp yaml: %v", err)
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		t.Fatalf("copy yaml: %v", err)
	}
	out.Close()

	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("LoadConfig: %v", err)
	}
	beforeToken := cfg.Auth.BrowserAuthToken
	t.Logf("before: auth.browser_auth_token = %q (legacy browser.auth_token cleared)", beforeToken)

	if EnsureSecrets(&cfg) {
		t.Logf("EnsureSecrets: changed=true (some secret was missing)")
	} else {
		t.Logf("EnsureSecrets: changed=false (all secrets already present)")
	}
	if cfg.Auth.BrowserAuthToken == "" {
		t.Fatalf("auth.browser_auth_token should be populated after EnsureSecrets")
	}
	t.Logf("after:  auth.browser_auth_token set (len=%d)", len(cfg.Auth.BrowserAuthToken))

	if err := SaveConfig(cfg); err != nil {
		t.Fatalf("SaveConfig: %v", err)
	}

	// Round-trip: reload and confirm the token persists and legacy
	// field is gone.
	cfg2, err := LoadConfig()
	if err != nil {
		t.Fatalf("LoadConfig (round-trip): %v", err)
	}
	if cfg2.Auth.BrowserAuthToken != cfg.Auth.BrowserAuthToken {
		t.Errorf("browser token drifted across round-trip")
	}
	if cfg2.Browser.LegacyAuthToken != "" {
		t.Errorf("legacy browser.auth_token leaked into reload")
	}
}
