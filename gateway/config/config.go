package config

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"

	"go.yaml.in/yaml/v3"
)

// ModelDefaults holds the fallback model for each use-case when no
// user-level model_assignment is configured.
type ModelDefaults struct {
	Chat    string
	Report  string
	Diary   string
	Goals   string
	Finance string
}

type Config struct {
	// Server
	HTTPAddr  string
	PublicURL string // full public base URL, e.g. http://localhost:8080

	// Database
	DatabaseURL string

	// Telegram
	TelegramBotToken   string
	TelegramWebhookURL string

	// Agent gRPC
	AgentGRPCAddr     string
	GRPCSharedSecret  string // shared secret sent in gRPC metadata for auth

	// JWT
	JWTSecret string

	// Encryption — AES-256-GCM master key for API keys at rest
	EncryptionKey string

	// CORS — comma-separated list of allowed origins (empty = "*" with warning)
	AllowedOrigins []string

	// Internal endpoints
	InternalLogSecret string // shared secret for /internal/logs

	// Sessions
	SessionDir string

	// Skills — path to the agent/skills directory (scanned for SKILL.md files)
	SkillsDir string

	// MinIO / S3-compatible storage
	MinioEndpoint  string
	MinioAccessKey string
	MinioSecretKey string
	MinioBucket    string
	MinioPublicURL string
	MinioUseSSL    bool

	// Google OAuth 2.0
	GoogleClientID     string
	GoogleClientSecret string
	GoogleRedirectURL  string

	// Model defaults — per-use-case fallback when user has no model_assignment.
	ModelDefaults ModelDefaults
}

// starnionYAML mirrors the relevant fields in ~/.starnion/starnion.yaml.
type starnionYAML struct {
	Minio struct {
		Endpoint  string `yaml:"endpoint"`
		AccessKey string `yaml:"access_key"`
		SecretKey string `yaml:"secret_key"`
		Bucket    string `yaml:"bucket"`
		PublicURL string `yaml:"public_url"`
		UseSSL    bool   `yaml:"use_ssl"`
	} `yaml:"minio"`
	Auth struct {
		JWTSecret         string `yaml:"jwt_secret"`
		AuthSecret        string `yaml:"auth_secret"`
		EncryptionKey     string `yaml:"encryption_key"`
		GRPCSharedSecret  string `yaml:"grpc_shared_secret"`
		InternalLogSecret string `yaml:"internal_log_secret"`
	} `yaml:"auth"`
	Database struct {
		Host     string `yaml:"host"`
		Port     int    `yaml:"port"`
		Name     string `yaml:"name"`
		User     string `yaml:"user"`
		Password string `yaml:"password"`
		SSLMode  string `yaml:"ssl_mode"`
	} `yaml:"database"`
	Gateway struct {
		Host           string `yaml:"host"`
		Port           int    `yaml:"port"`
		GRPCPort       int    `yaml:"grpc_port"`
		AgentHost      string `yaml:"agent_host"`
		AllowedOrigins string `yaml:"allowed_origins"`
		URL            string `yaml:"url"`
		SessionDir     string `yaml:"session_dir"`
	} `yaml:"gateway"`
	Telegram struct {
		BotToken   string `yaml:"bot_token"`
		WebhookURL string `yaml:"webhook_url"`
	} `yaml:"telegram"`
	Google struct {
		ClientID     string `yaml:"client_id"`
		ClientSecret string `yaml:"client_secret"`
		RedirectURI  string `yaml:"redirect_uri"`
	} `yaml:"google"`
	Cors struct {
		AllowedOrigins []string `yaml:"allowed_origins"`
	} `yaml:"cors"`
	Models struct {
		Defaults struct {
			Chat    string `yaml:"chat"`
			Report  string `yaml:"report"`
			Diary   string `yaml:"diary"`
			Goals   string `yaml:"goals"`
			Finance string `yaml:"finance"`
		} `yaml:"defaults"`
	} `yaml:"models"`
	UI struct {
		Port      int    `yaml:"port"`
		PublicURL string `yaml:"public_url"`
	} `yaml:"ui"`
}

// loadStarnionYAML reads ~/.starnion/starnion.yaml and returns the parsed config.
// Returns nil (no error) when the file does not exist.
func loadStarnionYAML() (*starnionYAML, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, nil
	}
	path := filepath.Join(home, ".starnion", "starnion.yaml")
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("reading starnion.yaml: %w", err)
	}
	var cfg starnionYAML
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parsing starnion.yaml: %w", err)
	}
	return &cfg, nil
}

func Load() *Config {
	// 1. Start with env-var defaults.
	cfg := &Config{
		HTTPAddr:           getEnv("GATEWAY_HTTP_ADDR", ":8080"),
		PublicURL:          getEnv("GATEWAY_PUBLIC_URL", ""),
		DatabaseURL:        getEnv("DATABASE_URL", ""),
		TelegramBotToken:   getEnv("TELEGRAM_BOT_TOKEN", ""),
		TelegramWebhookURL: getEnv("TELEGRAM_WEBHOOK_URL", ""),
		AgentGRPCAddr:      getEnv("AGENT_GRPC_ADDR", "localhost:50051"),
		GRPCSharedSecret:   getEnv("GRPC_SHARED_SECRET", ""),
		JWTSecret:          getEnv("JWT_SECRET", ""),
		EncryptionKey:      getEnv("ENCRYPTION_KEY", ""),
		InternalLogSecret:  getEnv("INTERNAL_LOG_SECRET", ""),
		SessionDir:         getEnv("SESSION_DIR", "/tmp/starnion-sessions"),
		SkillsDir:          getEnv("SKILLS_DIR", "../agent/skills"),
		MinioEndpoint:      getEnv("MINIO_ENDPOINT", ""),
		MinioAccessKey:     getEnv("MINIO_ACCESS_KEY", ""),
		MinioSecretKey:     getEnv("MINIO_SECRET_KEY", ""),
		MinioBucket:        getEnv("MINIO_BUCKET", "starnion-files"),
		MinioPublicURL:     getEnv("MINIO_PUBLIC_URL", ""),
		MinioUseSSL:        getEnv("MINIO_USE_SSL", "false") == "true",
		GoogleClientID:     getEnv("GOOGLE_CLIENT_ID", ""),
		GoogleClientSecret: getEnv("GOOGLE_CLIENT_SECRET", ""),
		GoogleRedirectURL:  getEnv("GOOGLE_REDIRECT_URL", ""),
		// Model defaults — built-in fallbacks (can be overridden by starnion.yaml).
		ModelDefaults: ModelDefaults{
			Chat:    "claude-sonnet-4-5",
			Report:  "claude-sonnet-4-5",
			Diary:   "claude-sonnet-4-5",
			Goals:   "claude-sonnet-4-5",
			Finance: "claude-sonnet-4-5",
		},
	}

	// Parse allowed origins from env (comma-separated).
	if originsEnv := getEnv("ALLOWED_ORIGINS", ""); originsEnv != "" {
		for _, o := range strings.Split(originsEnv, ",") {
			if trimmed := strings.TrimSpace(o); trimmed != "" {
				cfg.AllowedOrigins = append(cfg.AllowedOrigins, trimmed)
			}
		}
	}

	// 2. Override with ~/.starnion/starnion.yaml values (env vars take priority).
	y, err := loadStarnionYAML()
	if err != nil {
		// Log but don't crash — env vars may still provide needed values.
		fmt.Fprintf(os.Stderr, "warning: %v\n", err)
	}
	if y != nil {
		if cfg.MinioAccessKey == "" && y.Minio.AccessKey != "" {
			cfg.MinioAccessKey = y.Minio.AccessKey
		}
		if cfg.MinioSecretKey == "" && y.Minio.SecretKey != "" {
			cfg.MinioSecretKey = y.Minio.SecretKey
		}
		if cfg.MinioEndpoint == "" && y.Minio.Endpoint != "" {
			cfg.MinioEndpoint = y.Minio.Endpoint
		}
		if cfg.MinioBucket == "starnion-files" && y.Minio.Bucket != "" {
			cfg.MinioBucket = y.Minio.Bucket
		}
		if cfg.MinioPublicURL == "" && y.Minio.PublicURL != "" {
			cfg.MinioPublicURL = y.Minio.PublicURL
		}
		if !cfg.MinioUseSSL {
			cfg.MinioUseSSL = y.Minio.UseSSL
		}
		if cfg.JWTSecret == "" && y.Auth.JWTSecret != "" {
			cfg.JWTSecret = y.Auth.JWTSecret
		}
		if cfg.EncryptionKey == "" && y.Auth.EncryptionKey != "" {
			cfg.EncryptionKey = y.Auth.EncryptionKey
		}
		if cfg.GRPCSharedSecret == "" && y.Auth.GRPCSharedSecret != "" {
			cfg.GRPCSharedSecret = y.Auth.GRPCSharedSecret
		}
		if cfg.InternalLogSecret == "" && y.Auth.InternalLogSecret != "" {
			cfg.InternalLogSecret = y.Auth.InternalLogSecret
		}
		if len(cfg.AllowedOrigins) == 0 && y.Gateway.AllowedOrigins != "" {
			for _, o := range strings.Split(y.Gateway.AllowedOrigins, ",") {
				if trimmed := strings.TrimSpace(o); trimmed != "" {
					cfg.AllowedOrigins = append(cfg.AllowedOrigins, trimmed)
				}
			}
		}
		if cfg.DatabaseURL == "" && y.Database.Host != "" {
			sslMode := y.Database.SSLMode
			if sslMode == "" {
				sslMode = "disable"
			}
			port := y.Database.Port
			if port == 0 {
				port = 5432
			}
			cfg.DatabaseURL = fmt.Sprintf(
				"postgresql://%s:%s@%s:%d/%s?sslmode=%s",
				y.Database.User, y.Database.Password,
				y.Database.Host, port, y.Database.Name, sslMode,
			)
		}
		if cfg.AgentGRPCAddr == "localhost:50051" && y.Gateway.GRPCPort > 0 {
			agentHost := y.Gateway.AgentHost
			if agentHost == "" {
				agentHost = "localhost"
			}
			cfg.AgentGRPCAddr = fmt.Sprintf("%s:%d", agentHost, y.Gateway.GRPCPort)
		}
		if cfg.HTTPAddr == ":8080" && y.Gateway.Port > 0 {
			cfg.HTTPAddr = fmt.Sprintf(":%d", y.Gateway.Port)
		}
		if cfg.PublicURL == "" && y.Gateway.URL != "" {
			cfg.PublicURL = strings.TrimRight(y.Gateway.URL, "/")
		}
		if cfg.SessionDir == "/tmp/starnion-sessions" && y.Gateway.SessionDir != "" {
			cfg.SessionDir = y.Gateway.SessionDir
		}
		if cfg.TelegramBotToken == "" && y.Telegram.BotToken != "" {
			cfg.TelegramBotToken = y.Telegram.BotToken
		}
		if cfg.TelegramWebhookURL == "" && y.Telegram.WebhookURL != "" {
			cfg.TelegramWebhookURL = y.Telegram.WebhookURL
		}
		if cfg.GoogleClientID == "" && y.Google.ClientID != "" {
			cfg.GoogleClientID = y.Google.ClientID
		}
		if cfg.GoogleClientSecret == "" && y.Google.ClientSecret != "" {
			cfg.GoogleClientSecret = y.Google.ClientSecret
		}
		if cfg.GoogleRedirectURL == "" && y.Google.RedirectURI != "" {
			cfg.GoogleRedirectURL = y.Google.RedirectURI
		}
		if len(cfg.AllowedOrigins) == 0 && len(y.Cors.AllowedOrigins) > 0 {
			cfg.AllowedOrigins = y.Cors.AllowedOrigins
		}
		// Model defaults from starnion.yaml override built-in values.
		d := y.Models.Defaults
		if d.Chat != "" {
			cfg.ModelDefaults.Chat = d.Chat
		}
		if d.Report != "" {
			cfg.ModelDefaults.Report = d.Report
		}
		if d.Diary != "" {
			cfg.ModelDefaults.Diary = d.Diary
		}
		if d.Goals != "" {
			cfg.ModelDefaults.Goals = d.Goals
		}
		if d.Finance != "" {
			cfg.ModelDefaults.Finance = d.Finance
		}
	}

	// Auto-generate Google OAuth redirect URL from the web UI's public URL.
	// Google redirects the user's browser here, so it must be externally accessible.
	// The web route /auth/google/callback proxies the code to gateway internally.
	if cfg.GoogleRedirectURL == "" {
		var webOrigin string
		if len(cfg.AllowedOrigins) > 0 {
			webOrigin = cfg.AllowedOrigins[0]
		} else if y != nil && y.UI.PublicURL != "" {
			webOrigin = y.UI.PublicURL
		} else if y != nil && y.UI.Port > 0 {
			webOrigin = fmt.Sprintf("http://localhost:%d", y.UI.Port)
		}
		if webOrigin != "" {
			cfg.GoogleRedirectURL = strings.TrimRight(webOrigin, "/") + "/auth/google/callback"
		}
	}

	// Auto-detect SkillsDir for binary installs (~/.starnion/agent/skills)
	// when still using the default relative path that only works in source checkouts.
	if cfg.SkillsDir == "../agent/skills" {
		home, _ := os.UserHomeDir()
		candidate := filepath.Join(home, ".starnion", "agent", "skills")
		if info, err := os.Stat(candidate); err == nil && info.IsDir() {
			cfg.SkillsDir = candidate
		}
	}

	// JWT secret must be set — fail fast rather than use a weak default.
	if cfg.JWTSecret == "" {
		log.Fatal("FATAL: JWT_SECRET is not set. Set it via environment variable or starnion.yaml auth.jwt_secret")
	}
	if len(cfg.JWTSecret) < 32 {
		log.Fatal("FATAL: JWT_SECRET must be at least 32 characters long")
	}

	// EncryptionKey is required; length is flexible because deriveKey SHA-256-hashes it to 32 bytes.
	if cfg.EncryptionKey == "" {
		log.Fatal("FATAL: ENCRYPTION_KEY is not set. Set it via environment variable or starnion.yaml auth.encryption_key")
	}
	if len(cfg.AllowedOrigins) == 0 {
		fmt.Fprintln(os.Stderr, "WARNING: ALLOWED_ORIGINS is not set. CORS will allow all origins (*).")
	}
	if cfg.InternalLogSecret == "" {
		fmt.Fprintln(os.Stderr, "WARNING: INTERNAL_LOG_SECRET is not set. /internal/logs endpoint is unprotected.")
	}

	return cfg
}

func getEnv(key, defaultValue string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return defaultValue
}
