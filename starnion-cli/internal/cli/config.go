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
	JWTSecret        string `yaml:"jwt_secret"`
	AuthSecret       string `yaml:"auth_secret"`
	EncryptionKey    string `yaml:"encryption_key"`
	InternalLogSecret string `yaml:"internal_log_secret,omitempty"`
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
	BotToken   string `yaml:"bot_token,omitempty"`
	WebhookURL string `yaml:"webhook_url,omitempty"`
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

// EnsureSecrets auto-generates JWT, Auth, and Encryption secrets if they are empty.
func EnsureSecrets(cfg *StarNionConfig) {
	if cfg.Auth.JWTSecret == "" {
		cfg.Auth.JWTSecret = randomSecret(32)
	}
	if cfg.Auth.AuthSecret == "" {
		cfg.Auth.AuthSecret = randomSecret(32)
	}
	if cfg.Auth.EncryptionKey == "" {
		cfg.Auth.EncryptionKey = randomSecret(32) // 32 bytes → 64-char hex → AES-256
	}
	if cfg.Auth.InternalLogSecret == "" {
		cfg.Auth.InternalLogSecret = randomSecret(16)
	}
}

