// Package embedding is a small HTTP client that resolves a user's
// configured embedding provider from Postgres and calls Gemini or
// OpenAI-compatible endpoints. It was extracted from the handler
// package so CA slices (search, files, …) can share one implementation
// instead of each importing the handler god-package.
//
// Usage pattern:
//
//	cfg, err := embedding.ResolveConfig(ctx, db, userID, encryptionKey)
//	if err != nil { return err } // user hasn't configured an embedder
//	vec, err := embedding.Generate(ctx, cfg, "text to embed")
//	vecLit := embedding.VectorLiteral(vec) // -> "[0.12,0.34,...]" for pgvector
package embedding

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/newstarnion/gateway/internal/crypto"
	"github.com/newstarnion/gateway/internal/infrastructure/database"
)

const defaultGeminiEmbeddingModel = "text-embedding-004"

// Config holds the resolved embedding provider/model/credentials.
// It is returned by ResolveConfig and passed to Generate; callers
// never construct it manually.
type Config struct {
	Provider string
	Model    string
	APIKey   string
	BaseURL  string
}

// ResolveConfig reads model_assignments for use_case='embedding' and
// fetches the corresponding API key from providers. Gemini is the
// fallback provider if nothing is configured. Returns a non-nil error
// when no usable API key is available.
func ResolveConfig(ctx context.Context, db *database.DB, userID, encryptionKey string) (Config, error) {
	var provider, model string
	db.Pool().QueryRow(ctx,
		`SELECT provider, model FROM model_assignments WHERE user_id = $1 AND use_case = 'embedding'`,
		userID,
	).Scan(&provider, &model)

	if provider == "" {
		provider = "gemini"
		model = defaultGeminiEmbeddingModel
	}
	if model == "" {
		model = defaultModelForProvider(provider)
	}

	var encKey, baseURL string
	db.Pool().QueryRow(ctx,
		`SELECT api_key, base_url FROM providers WHERE user_id = $1 AND provider = $2`,
		userID, provider,
	).Scan(&encKey, &baseURL)
	apiKey, _ := crypto.Decrypt(encKey, encryptionKey)

	// Gemini fallback: also check the legacy integration_keys table.
	if apiKey == "" && provider == "gemini" {
		var encFallback string
		db.Pool().QueryRow(ctx,
			`SELECT api_key FROM integration_keys WHERE user_id = $1 AND provider = 'gemini'`,
			userID,
		).Scan(&encFallback)
		apiKey, _ = crypto.Decrypt(encFallback, encryptionKey)
	}

	if apiKey == "" {
		return Config{}, fmt.Errorf("no API key configured for embedding provider %q", provider)
	}
	return Config{Provider: provider, Model: model, APIKey: apiKey, BaseURL: baseURL}, nil
}

// GenerateAuto is the one-shot form that resolves the user's config
// and immediately calls the corresponding backend.
func GenerateAuto(ctx context.Context, db *database.DB, userID, encryptionKey, text string) ([]float32, error) {
	cfg, err := ResolveConfig(ctx, db, userID, encryptionKey)
	if err != nil {
		return nil, err
	}
	return Generate(ctx, cfg, text)
}

// Generate dispatches to the right embedding backend for the config.
func Generate(ctx context.Context, cfg Config, text string) ([]float32, error) {
	switch cfg.Provider {
	case "openai":
		return generateOpenAI(ctx, cfg.APIKey, "https://api.openai.com", cfg.Model, text)
	case "custom":
		base := cfg.BaseURL
		if base == "" {
			base = "http://localhost:11434"
		}
		return generateOpenAI(ctx, cfg.APIKey, base, cfg.Model, text)
	default: // gemini
		return generateGemini(ctx, cfg.APIKey, cfg.Model, text)
	}
}

// VectorLiteral converts a float32 slice into the `[f1,f2,...]` literal
// pgvector accepts when bound as a `::vector` query parameter.
func VectorLiteral(v []float32) string {
	sb := &strings.Builder{}
	sb.WriteByte('[')
	for i, f := range v {
		if i > 0 {
			sb.WriteByte(',')
		}
		fmt.Fprintf(sb, "%g", f)
	}
	sb.WriteByte(']')
	return sb.String()
}

func defaultModelForProvider(provider string) string {
	switch provider {
	case "openai":
		return "text-embedding-3-small"
	case "gemini":
		return defaultGeminiEmbeddingModel
	default:
		return "nomic-embed-text"
	}
}

// ── Gemini ─────────────────────────────────────────────────────────────────

func generateGemini(ctx context.Context, apiKey, model, text string) ([]float32, error) {
	type part struct {
		Text string `json:"text"`
	}
	type content struct {
		Parts []part `json:"parts"`
	}
	type reqBody struct {
		Model   string  `json:"model"`
		Content content `json:"content"`
	}

	body := reqBody{
		Model:   "models/" + model,
		Content: content{Parts: []part{{Text: text}}},
	}
	data, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}

	url := "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":embedContent?key=" + apiKey
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("gemini embedding API error %d: %s", resp.StatusCode, string(respBytes))
	}

	var result struct {
		Embedding struct {
			Values []float32 `json:"values"`
		} `json:"embedding"`
	}
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return nil, err
	}
	if len(result.Embedding.Values) == 0 {
		return nil, fmt.Errorf("gemini returned empty embedding")
	}
	return result.Embedding.Values, nil
}

// ── OpenAI / OpenAI-compatible (Ollama) ────────────────────────────────────

func generateOpenAI(ctx context.Context, apiKey, baseURL, model, text string) ([]float32, error) {
	type reqBody struct {
		Input string `json:"input"`
		Model string `json:"model"`
	}
	body := reqBody{Input: text, Model: model}
	data, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}

	url := strings.TrimRight(baseURL, "/") + "/v1/embeddings"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+apiKey)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("openai embedding API error %d: %s", resp.StatusCode, string(respBytes))
	}

	var result struct {
		Data []struct {
			Embedding []float32 `json:"embedding"`
		} `json:"data"`
	}
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return nil, err
	}
	if len(result.Data) == 0 || len(result.Data[0].Embedding) == 0 {
		return nil, fmt.Errorf("openai returned empty embedding")
	}
	return result.Data[0].Embedding, nil
}
