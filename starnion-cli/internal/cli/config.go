package cli

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"go.yaml.in/yaml/v3"
)

// StarNionConfig is the single source of truth stored at ~/.starnion/starnion.yaml.
// The gateway reads this file via gateway/config/config.go (starnionYAML struct).
// This struct is a superset — extra fields (google, telegram, embedding, admin,
// ui) are ignored by the gateway but used by the CLI and future services.
type StarNionConfig struct {
	Version   string          `yaml:"version,omitempty"`
	Database  DatabaseConfig  `yaml:"database"`
	Auth      AuthConfig      `yaml:"auth"`
	Minio     MinIOConfig     `yaml:"minio"`
	Gateway   GatewayConfig   `yaml:"gateway"`
	Models    ModelsConfig    `yaml:"models"`
	Telegram  TelegramConfig  `yaml:"telegram,omitempty"`
	Embedding EmbeddingConfig `yaml:"embedding,omitempty"`
	Admin     AdminConfig     `yaml:"admin,omitempty"`
	UI        UIConfig        `yaml:"ui,omitempty"`
	Browser   BrowserConfig   `yaml:"browser,omitempty"`
}

// BrowserConfig holds settings for the agent's browser-control bridge.
//
// AuthToken used to live here under `browser.auth_token`, but it is a
// shared secret — structurally the same as jwt_secret / encryption_key
// / grpc_shared_secret — so it now lives alongside them under
// `auth.browser_auth_token`. The LegacyAuthToken field below exists
// only to transparently migrate pre-existing yamls; LoadConfig copies
// it to AuthConfig.BrowserAuthToken and zeroes it on read, so the next
// SaveConfig emits the new field and drops the legacy one.
type BrowserConfig struct {
	Enabled bool `yaml:"enabled,omitempty"`
	// Deprecated: tokens are now stored in auth.browser_auth_token.
	// Kept here so LoadConfig can migrate old yamls in place.
	LegacyAuthToken string `yaml:"auth_token,omitempty"`
}

type DatabaseConfig struct {
	Host     string `yaml:"host"`
	Port     int    `yaml:"port"`
	Name     string `yaml:"name"`
	User     string `yaml:"user"`
	Password string `yaml:"password"`
	SSLMode  string `yaml:"ssl_mode"`
}

type AuthConfig struct {
	JWTSecret         string `yaml:"jwt_secret"`
	AuthSecret        string `yaml:"auth_secret"`
	EncryptionKey     string `yaml:"encryption_key"`
	GRPCSharedSecret  string `yaml:"grpc_shared_secret,omitempty"`
	InternalLogSecret string `yaml:"internal_log_secret,omitempty"`
	// BrowserAuthToken is the shared bearer for the agent's browser-
	// control HTTP bridge. Without it the agent disables the bridge
	// at startup with a loud warning, so EnsureSecrets auto-fills it
	// alongside the other shared secrets.
	BrowserAuthToken string `yaml:"browser_auth_token,omitempty"`
}

type MinIOConfig struct {
	Endpoint  string `yaml:"endpoint,omitempty"`
	AccessKey string `yaml:"access_key"`
	SecretKey string `yaml:"secret_key"`
	Bucket    string `yaml:"bucket"`
	PublicURL string `yaml:"public_url"`
	UseSSL    bool   `yaml:"use_ssl"`
}

// DeriveEndpoint fills Endpoint and UseSSL from PublicURL when Endpoint is empty.
func (m *MinIOConfig) DeriveEndpoint() {
	if m.PublicURL == "" || m.Endpoint != "" {
		return
	}
	host := m.PublicURL
	if after, ok := strings.CutPrefix(host, "https://"); ok {
		host = after
		m.UseSSL = true
	} else if after, ok := strings.CutPrefix(host, "http://"); ok {
		host = after
		m.UseSSL = false
	}
	if idx := strings.IndexByte(host, '/'); idx != -1 {
		host = host[:idx]
	}
	m.Endpoint = host
}

type GatewayConfig struct {
	Host           string `yaml:"host,omitempty"`
	Port           int    `yaml:"port"`
	GRPCPort       int    `yaml:"grpc_port"`
	AllowedOrigins string `yaml:"allowed_origins,omitempty"`
}

type ModelsConfig struct {
	Defaults ModelsDefaults `yaml:"defaults"`
}

type ModelsDefaults struct {
	Chat    string `yaml:"chat"`
	Report  string `yaml:"report"`
	Diary   string `yaml:"diary"`
	Goals   string `yaml:"goals"`
	Finance string `yaml:"finance"`
}

type TelegramConfig struct {
	BotToken      string `yaml:"bot_token,omitempty"`
	WebhookURL    string `yaml:"webhook_url,omitempty"`
	WebhookSecret string `yaml:"webhook_secret,omitempty"`
}

type EmbeddingConfig struct {
	Provider   string `yaml:"provider,omitempty"`
	APIKey     string `yaml:"api_key,omitempty"`
	Model      string `yaml:"model,omitempty"`
	Dimensions int    `yaml:"dimensions,omitempty"`
}

type AdminConfig struct {
	Email string `yaml:"email,omitempty"`
}

type UIConfig struct {
	Port      int    `yaml:"port,omitempty"`
	PublicURL string `yaml:"public_url,omitempty"`
}

// DefaultConfig returns a config with sensible defaults.
func DefaultConfig() StarNionConfig {
	return StarNionConfig{
		Version: "1.0.0",
		Database: DatabaseConfig{
			Host:    "localhost",
			Port:    5432,
			Name:    "starnion",
			User:    "postgres",
			SSLMode: "disable",
		},
		Minio: MinIOConfig{
			Bucket:    "starnion-files",
			PublicURL: "http://localhost:9000",
		},
		Gateway: GatewayConfig{
			Host:     "0.0.0.0",
			Port:     8080,
			GRPCPort: 50051,
		},
		Models: ModelsConfig{
			Defaults: ModelsDefaults{
				Chat:    "claude-sonnet-4-5",
				Report:  "claude-sonnet-4-5",
				Diary:   "claude-sonnet-4-5",
				Goals:   "claude-sonnet-4-5",
				Finance: "claude-sonnet-4-5",
			},
		},
		UI: UIConfig{Port: 3893},
		Embedding: EmbeddingConfig{
			Provider:   "openai",
			Model:      "text-embedding-3-small",
			Dimensions: 768,
		},
	}
}

// ConfigDir returns ~/.starnion.
func ConfigDir() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".starnion")
}

// ConfigPath returns the full path to starnion.yaml.
func ConfigPath() string {
	if p := os.Getenv("STARNION_CONFIG"); p != "" {
		return p
	}
	return filepath.Join(ConfigDir(), "starnion.yaml")
}

// ConfigExists reports whether the config file has been created.
func ConfigExists() bool {
	_, err := os.Stat(ConfigPath())
	return err == nil
}

// LoadConfig reads and parses starnion.yaml. Returns DefaultConfig if not found.
func LoadConfig() (StarNionConfig, error) {
	cfg := DefaultConfig()
	data, err := os.ReadFile(ConfigPath())
	if os.IsNotExist(err) {
		return cfg, nil
	}
	if err != nil {
		return cfg, fmt.Errorf("read config: %w", err)
	}
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return cfg, fmt.Errorf("parse config: %w", err)
	}
	cfg.Minio.DeriveEndpoint()
	// Migrate legacy browser.auth_token → auth.browser_auth_token so
	// older yamls (pre-reshuffle) upgrade transparently on the next
	// SaveConfig. The legacy field is zeroed so it isn't re-emitted.
	if cfg.Browser.LegacyAuthToken != "" && cfg.Auth.BrowserAuthToken == "" {
		cfg.Auth.BrowserAuthToken = cfg.Browser.LegacyAuthToken
	}
	cfg.Browser.LegacyAuthToken = ""
	return cfg, nil
}

// SaveConfig writes cfg to ~/.starnion/starnion.yaml with mode 0600.
func SaveConfig(cfg StarNionConfig) error {
	dir := ConfigDir()
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return fmt.Errorf("create config dir: %w", err)
	}
	data, err := yaml.Marshal(cfg)
	if err != nil {
		return fmt.Errorf("marshal config: %w", err)
	}
	if err := os.WriteFile(ConfigPath(), data, 0o600); err != nil {
		return fmt.Errorf("write config: %w", err)
	}
	return nil
}

// DSN builds a postgres DSN from DatabaseConfig.
func (d DatabaseConfig) DSN() string {
	return fmt.Sprintf("host=%s port=%d dbname=%s user=%s password=%s sslmode=%s",
		d.Host, d.Port, d.Name, d.User, d.Password, d.SSLMode)
}

// DatabaseURL returns the postgresql:// URL form.
func (d DatabaseConfig) DatabaseURL() string {
	return fmt.Sprintf("postgresql://%s:%s@%s:%d/%s?sslmode=%s",
		d.User, d.Password, d.Host, d.Port, d.Name, d.SSLMode)
}

// GatewayURL returns the public gateway URL derived from port.
func (g GatewayConfig) GatewayURL() string {
	return fmt.Sprintf("http://localhost:%d", g.Port)
}

// UIURL returns the public-facing URL for the web UI.
// Uses PublicURL if configured (e.g. https://starnion.example.com),
// otherwise falls back to http://localhost:<port>.
func (u UIConfig) UIURL() string {
	if u.PublicURL != "" {
		return strings.TrimRight(u.PublicURL, "/")
	}
	port := u.Port
	if port == 0 {
		port = 3893
	}
	return fmt.Sprintf("http://localhost:%d", port)
}

// randomSecret generates a cryptographically random hex string of `bytes` bytes.
func randomSecret(nbytes int) string {
	b := make([]byte, nbytes)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// EnsureSecrets auto-generates JWT, Auth, Encryption, gRPC, Internal-log, and
// Telegram webhook secrets if they are empty. The generated secrets are safe
// to persist to ~/.starnion/starnion.yaml and are consumed by both the
// gateway and the agent.
//
// Returns true when at least one field was filled so callers can decide
// whether the config needs to be re-saved. This avoids drift where a new
// secret is added to EnsureSecrets but a caller's dirty-check forgets it.
func EnsureSecrets(cfg *StarNionConfig) (changed bool) {
	fill := func(dst *string, size int) {
		if *dst == "" {
			*dst = randomSecret(size)
			changed = true
		}
	}
	fill(&cfg.Auth.JWTSecret, 32)
	fill(&cfg.Auth.AuthSecret, 32)
	fill(&cfg.Auth.EncryptionKey, 32) // 32 bytes → 64-char hex → AES-256
	fill(&cfg.Auth.GRPCSharedSecret, 32)
	fill(&cfg.Auth.InternalLogSecret, 16)
	fill(&cfg.Telegram.WebhookSecret, 16)
	// Browser control bridge — the agent's index.ts fail-fasts when
	// BROWSER_AUTH_TOKEN is unset (unless BROWSER_ENABLED=false). Populate
	// a secure random token under auth.browser_auth_token so a fresh
	// `starnion start` / `starnion dev` / `starnion setup` run works out
	// of the box without the user having to hand-craft a config field.
	fill(&cfg.Auth.BrowserAuthToken, 32)
	return changed
}
