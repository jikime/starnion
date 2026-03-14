package cli

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

// StarNionConfig is the single source of truth for all service configuration.
// Stored at ~/.starnion/starnion.yaml (permissions 0600).
// Gateway and Agent read from this file — no per-service .env files
// except ui/.env which is auto-generated for Next.js.
type StarNionConfig struct {
	Version   string          `yaml:"version"`
	Database  DatabaseConfig  `yaml:"database"`
	Admin     AdminConfig     `yaml:"admin"`
	MinIO     MinIOConfig     `yaml:"minio"`
	Gateway   GatewayConfig   `yaml:"gateway"`
	UI        UIConfig        `yaml:"ui"`
	Auth      AuthConfig      `yaml:"auth"`
	Google    GoogleConfig    `yaml:"google"`
	Gemini    GeminiConfig    `yaml:"gemini"`
	Embedding EmbeddingConfig `yaml:"embedding"`
	Log       LogConfig       `yaml:"log"`
	CORS      CORSConfig      `yaml:"cors"`
}

// GeminiConfig holds the server-level Gemini model configuration.
// API keys are stored per-user in integration_keys (provider='gemini').
// Set the model via: starnion config gemini
type GeminiConfig struct {
	Model string `yaml:"model"` // e.g. "gemini-2.5-pro"
}

// GoogleConfig holds server-level Google OAuth2 credentials.
// These are registered once in Google Cloud Console and shared by all users.
// Per-user tokens (access_token, refresh_token) are stored in the google_tokens DB table.
type GoogleConfig struct {
	ClientID     string `yaml:"client_id"`
	ClientSecret string `yaml:"client_secret"`
	RedirectURI  string `yaml:"redirect_uri"`
}

// EmbeddingConfig holds the server-level embedding configuration.
// All user data (searches, documents, memories) is embedded with this single model.
// WARNING: Changing the provider/model after initial setup requires re-indexing all DB vectors.
type EmbeddingConfig struct {
	Provider   string `yaml:"provider"`    // "openai" | "gemini"
	APIKey     string `yaml:"api_key"`
	Model      string `yaml:"model"`       // e.g. "text-embedding-3-small" or "gemini-embedding-001"
	Dimensions int    `yaml:"dimensions"`  // must match pgvector column (768)
}

type DatabaseConfig struct {
	Host     string `yaml:"host"`
	Port     int    `yaml:"port"`
	Name     string `yaml:"name"`
	User     string `yaml:"user"`
	Password string `yaml:"password"`
	SSLMode  string `yaml:"ssl_mode"`
}

type AdminConfig struct {
	Email string `yaml:"email"`
}

type MinIOConfig struct {
	Endpoint  string `yaml:"endpoint"`   // host:port — auto-derived from PublicURL if empty
	AccessKey string `yaml:"access_key"`
	SecretKey string `yaml:"secret_key"`
	Bucket    string `yaml:"bucket"`
	PublicURL string `yaml:"public_url"` // full URL shown to browser (e.g. http://localhost:9000)
	UseSSL    bool   `yaml:"use_ssl"`    // auto-derived from PublicURL scheme if not set explicitly
}

// DeriveEndpoint fills Endpoint and UseSSL from PublicURL when they are not
// explicitly configured (e.g. after setup wizard or on first load).
func (m *MinIOConfig) DeriveEndpoint() {
	if m.PublicURL == "" || m.Endpoint != "" {
		return
	}
	u := m.PublicURL
	// Strip scheme.
	host := u
	if after, ok := strings.CutPrefix(u, "https://"); ok {
		host = after
		m.UseSSL = true
	} else if after, ok := strings.CutPrefix(u, "http://"); ok {
		host = after
		m.UseSSL = false
	}
	// Strip any trailing path.
	if idx := strings.IndexByte(host, '/'); idx != -1 {
		host = host[:idx]
	}
	m.Endpoint = host
}

type GatewayConfig struct {
	Host      string `yaml:"host"`       // bind address (e.g. "0.0.0.0")
	URL       string `yaml:"url"`        // public URL (e.g. "http://localhost:8080")
	Port      int    `yaml:"port"`
	GRPCPort  int    `yaml:"grpc_port"`
	AgentHost string `yaml:"agent_host"` // gRPC agent host (e.g. "localhost")
}

type UIConfig struct {
	Port int `yaml:"port"`
}

type AuthConfig struct {
	JWTSecret  string `yaml:"jwt_secret"`
	AuthSecret string `yaml:"auth_secret"`
}

type LogConfig struct {
	Level  string `yaml:"level"`  // debug | info | warn | error
	Format string `yaml:"format"` // console | json
}

type CORSConfig struct {
	AllowedOrigins []string `yaml:"allowed_origins"`
	AllowedMethods []string `yaml:"allowed_methods"`
	AllowedHeaders []string `yaml:"allowed_headers"`
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
		MinIO: MinIOConfig{
			Bucket:    "starnion-files",
			PublicURL: "http://localhost:9000",
		},
		Gateway: GatewayConfig{
			Host:      "0.0.0.0",
			URL:       "http://localhost:8080",
			Port:      8080,
			GRPCPort:  50051,
			AgentHost: "localhost",
		},
		UI: UIConfig{Port: 3893},
		Embedding: EmbeddingConfig{
			Provider:   "openai",
			Model:      "text-embedding-3-small",
			Dimensions: 768,
		},
		Log: LogConfig{
			Level:  "info",
			Format: "console",
		},
		CORS: CORSConfig{
			AllowedOrigins: []string{"http://localhost:3893"},
			AllowedMethods: []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
			AllowedHeaders: []string{"Authorization", "Content-Type"},
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
	cfg.MinIO.DeriveEndpoint()
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

// randomSecret generates a cryptographically random hex string of `bytes` bytes.
func randomSecret(bytes int) string {
	b := make([]byte, bytes)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// EnsureSecrets auto-generates JWT and Auth secrets if they are empty.
func EnsureSecrets(cfg *StarNionConfig) bool {
	changed := false
	if cfg.Auth.JWTSecret == "" {
		cfg.Auth.JWTSecret = randomSecret(32)
		changed = true
	}
	if cfg.Auth.AuthSecret == "" {
		cfg.Auth.AuthSecret = randomSecret(32)
		changed = true
	}
	return changed
}

// WriteDockerEnv generates docker/.env for Docker Compose from the config.
// This is the single source of truth that docker-compose.yml reads via ${VAR} interpolation.
func WriteDockerEnv(cfg StarNionConfig, dockerDir string) error {
	db := cfg.Database
	gw := cfg.Gateway

	content := fmt.Sprintf(`# StarNion Docker Environment — auto-generated by starnion docker setup
# Edit ~/.starnion/starnion.yaml and re-run 'starnion docker setup' to regenerate.

# Secrets
POSTGRES_PASSWORD=%s
MINIO_SECRET_KEY=%s
JWT_SECRET=%s
AUTH_SECRET=%s

# PostgreSQL
POSTGRES_DB=%s
POSTGRES_USER=%s
POSTGRES_PORT=%d

# MinIO
MINIO_ACCESS_KEY=%s
MINIO_BUCKET=%s
MINIO_PORT=9000
MINIO_CONSOLE_PORT=9001
MINIO_PUBLIC_URL=%s

# Gateway
GATEWAY_PORT=%d
GATEWAY_PUBLIC_URL=%s
GRPC_PORT=%d

# UI
UI_PORT=%d
NEXTAUTH_URL=http://localhost:%d

# Google OAuth2 (optional — leave empty to disable Google integration)
GOOGLE_CLIENT_ID=%s
GOOGLE_CLIENT_SECRET=%s
GOOGLE_REDIRECT_URI=%s

# Embedding (server-wide — all vectors must use the same model)
EMBEDDING_PROVIDER=%s
EMBEDDING_API_KEY=%s
EMBEDDING_MODEL=%s
EMBEDDING_DIMENSIONS=%d
`,
		db.Password,
		cfg.MinIO.SecretKey,
		cfg.Auth.JWTSecret,
		cfg.Auth.AuthSecret,
		db.Name,
		db.User,
		db.Port,
		cfg.MinIO.AccessKey,
		cfg.MinIO.Bucket,
		cfg.MinIO.PublicURL,
		gw.Port,
		gw.URL,
		gw.GRPCPort,
		cfg.UI.Port,
		cfg.UI.Port,
		cfg.Google.ClientID,
		cfg.Google.ClientSecret,
		cfg.Google.RedirectURI,
		cfg.Embedding.Provider,
		cfg.Embedding.APIKey,
		cfg.Embedding.Model,
		cfg.Embedding.Dimensions,
	)

	path := filepath.Join(dockerDir, ".env")
	return os.WriteFile(path, []byte(content), 0o600)
}

// WriteUIEnv writes ui/.env on first install (file does not exist yet).
// If the file already exists, use MergeUIEnv to add only missing keys.
// Next.js requires environment variables at build/dev time, so this is the
// only per-service file still generated. Gateway and Agent read
// ~/.starnion/starnion.yaml directly.
func WriteUIEnv(cfg StarNionConfig, projectRoot string) error {
	path := filepath.Join(projectRoot, "ui", ".env")
	if _, err := os.Stat(path); err == nil {
		// File already exists — only add missing keys.
		return MergeUIEnv(cfg, projectRoot)
	}
	uiEnv := fmt.Sprintf(`# Auto-generated by starnion setup — do not edit manually.
# Gateway and Agent read ~/.starnion/starnion.yaml directly.
AUTH_SECRET=%s
API_URL=%s
JWT_SECRET=%s
AUTH_TRUST_HOST=true
NEXTAUTH_URL=http://localhost:%d
`,
		cfg.Auth.AuthSecret,
		cfg.Gateway.URL,
		cfg.Auth.JWTSecret,
		cfg.UI.Port,
	)
	if err := os.WriteFile(path, []byte(uiEnv), 0o600); err != nil {
		return fmt.Errorf("write %s: %w", path, err)
	}
	return nil
}

// MergeUIEnv reads the existing ui/.env and adds any keys that are present in
// the config but missing from the file. Keys that already exist with an empty
// value are updated in-place when the config has a non-empty value.
func MergeUIEnv(cfg StarNionConfig, projectRoot string) error {
	path := filepath.Join(projectRoot, "ui", ".env")

	// Desired key→value pairs from current config.
	desired := map[string]string{
		"AUTH_SECRET":     cfg.Auth.AuthSecret,
		"API_URL":         cfg.Gateway.URL,
		"JWT_SECRET":      cfg.Auth.JWTSecret,
		"AUTH_TRUST_HOST": "true",
		"NEXTAUTH_URL":    fmt.Sprintf("http://localhost:%d", cfg.UI.Port),
	}

	// Read existing file; track key→value so we can detect empty values.
	existing := map[string]string{}
	var lines []string
	if data, err := os.ReadFile(path); err == nil {
		for _, line := range strings.Split(string(data), "\n") {
			lines = append(lines, line)
			if idx := strings.IndexByte(line, '='); idx > 0 {
				key := strings.TrimSpace(line[:idx])
				if key != "" && !strings.HasPrefix(key, "#") {
					existing[key] = strings.TrimSpace(line[idx+1:])
				}
			}
		}
		// Remove trailing empty line added by Split so we don't double-newline.
		for len(lines) > 0 && lines[len(lines)-1] == "" {
			lines = lines[:len(lines)-1]
		}
	}

	// In-place update: replace lines where the existing value is empty but
	// the desired value is non-empty.
	changed := 0
	for i, line := range lines {
		if idx := strings.IndexByte(line, '='); idx > 0 {
			key := strings.TrimSpace(line[:idx])
			val := strings.TrimSpace(line[idx+1:])
			if val == "" {
				if dv, ok := desired[key]; ok && dv != "" {
					lines[i] = key + "=" + dv
					existing[key] = dv
					changed++
				}
			}
		}
	}

	// Append keys that were completely missing.
	order := []string{"AUTH_SECRET", "API_URL", "JWT_SECRET", "AUTH_TRUST_HOST", "NEXTAUTH_URL"}
	added := 0
	for _, key := range order {
		if _, exists := existing[key]; !exists {
			lines = append(lines, key+"="+desired[key])
			added++
		}
	}
	if changed == 0 && added == 0 {
		return nil // nothing to do
	}
	lines = append(lines, "")
	return os.WriteFile(path, []byte(strings.Join(lines, "\n")), 0o600)
}
