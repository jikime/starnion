package handler

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

// embeddingConfig holds the resolved embedding provider/model/credentials.
type embeddingConfig struct {
	provider string
	model    string
	apiKey   string
	baseURL  string
}

// resolveEmbeddingConfig reads model_assignments for use_case='embedding' and
// fetches the corresponding API key from providers. Falls back to Gemini.
func resolveEmbeddingConfig(ctx context.Context, db *database.DB, userID, encryptionKey string) (embeddingConfig, error) {
	// Check model assignment
	var provider, model string
	db.QueryRowContext(ctx,
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

	// Get API key + base URL from providers table
	var encKey, baseURL string
	db.QueryRowContext(ctx,
		`SELECT api_key, base_url FROM providers WHERE user_id = $1 AND provider = $2`,
		userID, provider,
	).Scan(&encKey, &baseURL)
	apiKey, _ := crypto.Decrypt(encKey, encryptionKey)

	// Gemini fallback: also check legacy integration_keys table
	if apiKey == "" && provider == "gemini" {
		var encFallback string
		db.QueryRowContext(ctx,
			`SELECT api_key FROM integration_keys WHERE user_id = $1 AND provider = 'gemini'`,
			userID,
		).Scan(&encFallback)
		apiKey, _ = crypto.Decrypt(encFallback, encryptionKey)
	}

	if apiKey == "" {
		return embeddingConfig{}, fmt.Errorf("no API key configured for embedding provider %q", provider)
	}
	return embeddingConfig{provider: provider, model: model, apiKey: apiKey, baseURL: baseURL}, nil
}

// defaultModelForProvider returns a sensible default embedding model per provider.
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

// generateEmbeddingAuto resolves the embedding config from DB and calls the correct backend.
// This is the preferred call site for all embedding generation.
func generateEmbeddingAuto(ctx context.Context, db *database.DB, userID, encryptionKey, text string) ([]float32, error) {
	cfg, err := resolveEmbeddingConfig(ctx, db, userID, encryptionKey)
	if err != nil {
		return nil, err
	}
	return generateEmbeddingWithConfig(ctx, cfg, text)
}

// generateEmbeddingWithConfig dispatches to the right embedding backend.
func generateEmbeddingWithConfig(ctx context.Context, cfg embeddingConfig, text string) ([]float32, error) {
	switch cfg.provider {
	case "openai":
		return generateEmbeddingOpenAI(ctx, cfg.apiKey, "https://api.openai.com", cfg.model, text)
	case "custom":
		base := cfg.baseURL
		if base == "" {
			base = "http://localhost:11434"
		}
		return generateEmbeddingOpenAI(ctx, cfg.apiKey, base, cfg.model, text)
	default: // gemini
		return generateEmbeddingGemini(ctx, cfg.apiKey, cfg.model, text)
	}
}

// ── Gemini ─────────────────────────────────────────────────────────────────

const defaultGeminiEmbeddingModel = "text-embedding-004"

// getGeminiAPIKey fetches the user's Gemini API key from integration_keys.
// Returns ("", sql.ErrNoRows) if not set.
// Kept for backward compatibility with non-embedding Gemini calls (generateText).
func getGeminiAPIKey(ctx context.Context, db *database.DB, userID, encryptionKey string) (string, error) {
	var encKey string
	err := db.QueryRowContext(ctx,
		`SELECT api_key FROM integration_keys WHERE user_id = $1 AND provider = 'gemini'`,
		userID,
	).Scan(&encKey)
	if err != nil {
		return "", err
	}
	apiKey, _ := crypto.Decrypt(encKey, encryptionKey)
	return apiKey, nil
}

// generateEmbeddingGemini calls the Gemini Embedding API with an explicit model.
func generateEmbeddingGemini(ctx context.Context, apiKey, model, text string) ([]float32, error) {
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

// generateEmbeddingOpenAI calls the OpenAI embeddings endpoint (or any OpenAI-compatible API).
func generateEmbeddingOpenAI(ctx context.Context, apiKey, baseURL, model, text string) ([]float32, error) {
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

// ── Gemini text generation ──────────────────────────────────────────────────

const geminiGenerateURL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"

// generateText calls Gemini to generate text from a prompt. Returns the first candidate text.
func generateText(ctx context.Context, apiKey, prompt string) (string, error) {
	type part struct {
		Text string `json:"text"`
	}
	type content struct {
		Parts []part `json:"parts"`
	}
	type reqBody struct {
		Contents []content `json:"contents"`
	}

	body := reqBody{Contents: []content{{Parts: []part{{Text: prompt}}}}}
	data, err := json.Marshal(body)
	if err != nil {
		return "", err
	}

	url := geminiGenerateURL + "?key=" + apiKey
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(data))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("gemini generate API error %d: %s", resp.StatusCode, string(respBytes))
	}

	var result struct {
		Candidates []struct {
			Content struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			} `json:"content"`
		} `json:"candidates"`
	}
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return "", err
	}
	if len(result.Candidates) == 0 || len(result.Candidates[0].Content.Parts) == 0 {
		return "", fmt.Errorf("gemini returned no candidates")
	}
	return result.Candidates[0].Content.Parts[0].Text, nil
}

// ── Utilities ──────────────────────────────────────────────────────────────

// vectorLiteral converts a float32 slice to a PostgreSQL vector literal: "[f1,f2,...]".
func vectorLiteral(v []float32) string {
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
