package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/newstarnion/gateway/internal/crypto"
	"github.com/newstarnion/gateway/internal/infrastructure/database"
)

// ── Skill env resolution ──────────────────────────────────────────────────────

// skillEnvEntry maps a provider's stored key to one or two environment variables.
// Compound keys (stored as "id:secret") use idKey+secretKey; simple keys use envKey.
type skillEnvEntry struct {
	envKey    string // simple key → single env var
	idKey     string // compound key → id part
	secretKey string // compound key → secret part
}

// providerSkillEnvMap maps integration_keys providers to subprocess env vars.
var providerSkillEnvMap = map[string]skillEnvEntry{
	"tavily":       {envKey: "TAVILY_API_KEY"},
	"gemini":       {envKey: "GEMINI_API_KEY"},
	"github":       {envKey: "GITHUB_TOKEN"},
	"notion":       {envKey: "NOTION_API_KEY"},
	"openai":       {envKey: "OPENAI_API_KEY"},
	"groq":         {envKey: "GROQ_API_KEY"},
	"naver_search": {idKey: "NAVER_SEARCH_CLIENT_ID", secretKey: "NAVER_SEARCH_CLIENT_SECRET"},
	"naver_map":    {idKey: "NAVER_MAP_CLIENT_ID", secretKey: "NAVER_MAP_CLIENT_SECRET"},
}

// resolveDisabledSkillsJSON returns a JSON array of skill IDs that the user has explicitly
// disabled in the user_skills table. Returns "" when all skills are enabled or on error.
func resolveDisabledSkillsJSON(ctx context.Context, db *database.DB, userID uuid.UUID) string {
	rows, err := db.QueryContext(ctx,
		`SELECT skill_id FROM user_skills WHERE user_id = $1 AND enabled = false`,
		userID,
	)
	if err != nil {
		return ""
	}
	defer rows.Close()

	var ids []string
	for rows.Next() {
		var id string
		if rows.Scan(&id) != nil {
			continue
		}
		ids = append(ids, id)
	}

	if len(ids) == 0 {
		return ""
	}
	data, err := json.Marshal(ids)
	if err != nil {
		return ""
	}
	return string(data)
}

// resolveSkillEnvJSON fetches all integration_keys for userID, decrypts them,
// and returns a JSON object of env var names → plaintext values ready for gRPC metadata.
// Returns "" when no keys exist or on error — callers fall back to DB lookup in that case.
func resolveSkillEnvJSON(ctx context.Context, db *database.DB, userID uuid.UUID, encryptionKey string) string {
	rows, err := db.QueryContext(ctx,
		`SELECT provider, api_key FROM integration_keys WHERE user_id = $1`,
		userID,
	)
	if err != nil {
		return ""
	}
	defer rows.Close()

	env := make(map[string]string)
	for rows.Next() {
		var provider, encKey string
		if rows.Scan(&provider, &encKey) != nil {
			continue
		}
		mapping, ok := providerSkillEnvMap[provider]
		if !ok {
			continue
		}
		plain, err := crypto.Decrypt(encKey, encryptionKey)
		if err != nil || plain == "" {
			continue
		}
		if mapping.envKey != "" {
			env[mapping.envKey] = plain
		} else if mapping.idKey != "" && mapping.secretKey != "" {
			id, secret, found := strings.Cut(plain, ":")
			if found && id != "" && secret != "" {
				env[mapping.idKey] = id
				env[mapping.secretKey] = secret
			}
		}
	}

	if len(env) == 0 {
		return ""
	}
	data, err := json.Marshal(env)
	if err != nil {
		return ""
	}
	return string(data)
}

// FallbackProvider is a single entry in the LLM fallback chain sent to the agent.
type FallbackProvider struct {
	Provider string `json:"provider"`
	APIKey   string `json:"api_key"`
	Model    string `json:"model"`
	BaseURL  string `json:"base_url,omitempty"`
}

// fallbackPriority defines the preferred provider order for the fallback chain.
// Lower index = tried first. Ollama (local) would be index 0 if ever added.
var fallbackPriority = []string{"groq", "openrouter", "openai", "anthropic"}

// providerDefaultModels maps each provider to the default model used in fallback.
// These are validated pi-ai model IDs.
var providerDefaultModels = map[string]string{
	"groq":       "llama-3.3-70b-versatile",
	"openrouter": "meta-llama/llama-3.3-70b-instruct",
	"openai":     "gpt-4o-mini",
	"anthropic":  "claude-haiku-4-5",
}

// resolveFallbackChain builds an ordered provider fallback chain for the given user.
// The primary provider (from persona) is excluded since it is passed separately.
// Returns a JSON string ready to be sent in gRPC metadata, or "" on error/empty.
func resolveFallbackChain(ctx context.Context, db *database.DB, userID uuid.UUID, encryptionKey, primaryProvider string) string {
	rows, err := db.QueryContext(ctx,
		`SELECT provider, COALESCE(api_key,''), COALESCE(base_url,'')
		 FROM providers WHERE user_id = $1`,
		userID,
	)
	if err != nil {
		return ""
	}
	defer rows.Close()

	// Build a map of configured providers: provider → {APIKey, BaseURL}
	type providerEntry struct {
		apiKey  string
		baseURL string
	}
	configured := map[string]providerEntry{}
	for rows.Next() {
		var prov, encKey, baseURL string
		if rows.Scan(&prov, &encKey, &baseURL) != nil {
			continue
		}
		plain, _ := crypto.Decrypt(encKey, encryptionKey)
		configured[prov] = providerEntry{apiKey: plain, baseURL: baseURL}
	}

	// Build the ordered chain, skipping the primary provider.
	var chain []FallbackProvider
	for _, prov := range fallbackPriority {
		if prov == primaryProvider {
			continue // primary is handled separately
		}
		entry, ok := configured[prov]
		if !ok {
			continue // user has not configured this provider
		}
		model := providerDefaultModels[prov]
		if model == "" {
			continue
		}
		chain = append(chain, FallbackProvider{
			Provider: prov,
			APIKey:   entry.apiKey,
			Model:    model,
			BaseURL:  entry.baseURL,
		})
	}

	if len(chain) == 0 {
		return ""
	}
	data, err := json.Marshal(chain)
	if err != nil {
		return ""
	}
	return string(data)
}

// personaInfo holds the resolved persona fields for a chat session.
type personaInfo struct {
	provider     string
	model        string
	systemPrompt string
	apiKey       string
	botName      string
}

// resolveAssignedModel returns the model from model_assignments for the given use case.
// Returns empty string if no assignment exists.
func resolveAssignedModel(ctx context.Context, db *database.DB, userID uuid.UUID, useCase string) string {
	var model string
	db.QueryRowContext(ctx,
		`SELECT model FROM model_assignments WHERE user_id = $1 AND use_case = $2 LIMIT 1`,
		userID, useCase,
	).Scan(&model)
	return model
}

// resolvePersona looks up the persona for a conversation:
// 1. If the conversation has a persona_id, use that persona.
// 2. Otherwise fall back to the user's default persona.
// Then fetches and decrypts the API key for the resolved provider.
//
// Optimized: reduces 4 serial queries to 2 using a CTE that resolves the
// persona (conversation-specific → default fallback) and user language in
// one round-trip, then fetches the API key in a second query.
func resolvePersona(ctx context.Context, db *database.DB, convID, userID uuid.UUID, encryptionKey string) personaInfo {
	var info personaInfo
	var botName, userName, language string

	// Single query: resolve persona (conv-specific → default fallback) + user language.
	// users is the anchor row so user language is always returned even when no persona exists.
	db.QueryRowContext(ctx, `
		WITH conv_persona AS (
			SELECT p.provider, p.model, p.system_prompt, p.bot_name, p.user_name
			FROM conversations c
			JOIN personas p ON p.id = c.persona_id
			WHERE c.id = $1
		),
		default_persona AS (
			SELECT provider, model, system_prompt, bot_name, user_name
			FROM personas
			WHERE user_id = $2 AND is_default = TRUE
			LIMIT 1
		),
		resolved AS (
			SELECT * FROM conv_persona
			UNION ALL
			SELECT * FROM default_persona
			LIMIT 1
		)
		SELECT
			COALESCE(r.provider, ''),
			COALESCE(r.model, ''),
			COALESCE(r.system_prompt, ''),
			COALESCE(r.bot_name, ''),
			COALESCE(r.user_name, ''),
			COALESCE(u.preferences->>'language', '')
		FROM users u
		LEFT JOIN resolved r ON true
		WHERE u.id = $2
		LIMIT 1`,
		convID, userID,
	).Scan(&info.provider, &info.model, &info.systemPrompt, &botName, &userName, &language)

	info.botName = botName
	info.systemPrompt = buildSystemPrompt(botName, userName, language, info.systemPrompt)

	// Apply defaults: empty provider/model → anthropic/claude-sonnet-4-5
	if info.provider == "" {
		info.provider = "anthropic"
	}
	if info.model == "" {
		info.model = "claude-sonnet-4-5"
	}

	// Fetch and decrypt API key for the resolved provider.
	var encrypted string
	if err := db.QueryRowContext(ctx,
		`SELECT COALESCE(api_key,'') FROM providers WHERE user_id = $1 AND provider = $2 LIMIT 1`,
		userID, info.provider,
	).Scan(&encrypted); err == nil && encrypted != "" {
		info.apiKey, _ = crypto.Decrypt(encrypted, encryptionKey)
	}
	// No per-user key is fine — agent falls back to system-wide ANTHROPIC_OAUTH_TOKEN

	return info
}

// buildSystemPrompt prepends bot/user name context and a language instruction to the raw system prompt.
// If all optional fields are empty, returns the raw prompt unchanged.
func buildSystemPrompt(botName, userName, language, rawPrompt string) string {
	var parts []string
	if botName != "" {
		parts = append(parts, fmt.Sprintf("Your name is '%s'.", botName))
	}
	if userName != "" {
		parts = append(parts, fmt.Sprintf("The user you are talking to is named '%s'.", userName))
	}
	if language != "" {
		parts = append(parts, fmt.Sprintf("Always respond in %s.", language))
	}
	if len(parts) == 0 {
		return rawPrompt
	}
	prefix := strings.Join(parts, " ")
	if rawPrompt == "" {
		return prefix
	}
	return prefix + "\n\n" + rawPrompt
}
