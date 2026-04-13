package chatctx

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

// ResolveDisabledSkillsJSON returns a JSON array of skill IDs that the user has explicitly
// disabled in the user_skills table. Returns "" when all skills are enabled or on error.
// Results are cached per user for 5 minutes (configCache) since skill toggles change rarely.
func ResolveDisabledSkillsJSON(ctx context.Context, db *database.DB, userID uuid.UUID) string {
	if v, ok := loadCached(userID, "disabledSkills"); ok {
		return v.(string)
	}

	rows, err := db.Pool().Query(ctx,
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

	var result string
	if len(ids) > 0 {
		if data, err := json.Marshal(ids); err == nil {
			result = string(data)
		}
	}
	storeCached(userID, "disabledSkills", result)
	return result
}

// ResolveSkillEnvJSON fetches all integration_keys for userID, decrypts them,
// and returns a JSON object of env var names → plaintext values ready for gRPC metadata.
// Returns "" when no keys exist or on error — callers fall back to DB lookup in that case.
// ResolveSkillEnv fetches all integration_keys for userID in a single query,
// decrypts them, and returns both the skill-env JSON payload (ready to forward
// in gRPC metadata) and the list of provider names. Callers that previously
// issued a separate `SELECT provider FROM integration_keys` should use the
// returned `providers` slice instead to avoid double-hitting the table.
func ResolveSkillEnv(ctx context.Context, db *database.DB, userID uuid.UUID, encryptionKey string) (envJSON string, providers []string) {
	type skillEnvResult struct {
		envJSON   string
		providers []string
	}
	if v, ok := loadCached(userID, "skillEnv"); ok {
		r := v.(skillEnvResult)
		return r.envJSON, r.providers
	}

	rows, err := db.Pool().Query(ctx,
		`SELECT provider, api_key FROM integration_keys WHERE user_id = $1`,
		userID,
	)
	if err != nil {
		return "", nil
	}
	defer rows.Close()

	// Preallocate — typical users configure 2-5 providers, so the first
	// append on a nil slice used to trigger a grow+copy for every caller.
	providers = make([]string, 0, 8)
	env := make(map[string]string, 8)
	for rows.Next() {
		var provider, encKey string
		if rows.Scan(&provider, &encKey) != nil {
			continue
		}
		providers = append(providers, provider)
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
		storeCached(userID, "skillEnv", skillEnvResult{"", providers})
		return "", providers
	}
	data, err := json.Marshal(env)
	if err != nil {
		storeCached(userID, "skillEnv", skillEnvResult{"", providers})
		return "", providers
	}
	result := string(data)
	storeCached(userID, "skillEnv", skillEnvResult{result, providers})
	return result, providers
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

// ResolveFallbackChain builds an ordered provider fallback chain for the given user.
// The primary provider (from persona) is excluded since it is passed separately.
// Returns a JSON string ready to be sent in gRPC metadata, or "" on error/empty.
//
// The raw provider data (provider → decrypted key + base_url) is cached per user
// for 5 minutes since provider configuration changes rarely. The chain assembly
// itself is cheap and runs in-memory after the cache hit.
func ResolveFallbackChain(ctx context.Context, db *database.DB, userID uuid.UUID, encryptionKey, primaryProvider string) string {
	type providerEntry struct {
		apiKey  string
		baseURL string
	}

	// Load or populate the per-user provider map cache.
	var configured map[string]providerEntry
	if v, ok := loadCached(userID, "providerMap"); ok {
		configured = v.(map[string]providerEntry)
	} else {
		rows, err := db.Pool().Query(ctx,
			`SELECT provider, COALESCE(api_key,''), COALESCE(base_url,'')
			 FROM providers WHERE user_id = $1`,
			userID,
		)
		if err != nil {
			return ""
		}
		defer rows.Close()

		configured = map[string]providerEntry{}
		for rows.Next() {
			var prov, encKey, baseURL string
			if rows.Scan(&prov, &encKey, &baseURL) != nil {
				continue
			}
			plain, _ := crypto.Decrypt(encKey, encryptionKey)
			configured[prov] = providerEntry{apiKey: plain, baseURL: baseURL}
		}
		storeCached(userID, "providerMap", configured)
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

// PersonaInfo holds the resolved persona fields for a chat session.
type PersonaInfo struct {
	Provider     string
	Model        string
	SystemPrompt string
	APIKey       string
	BotName      string
}

// ResolveAssignedModel returns the model from model_assignments for the given use case.
// Returns empty string if no assignment exists. Cached per user+useCase for 5 minutes.
func ResolveAssignedModel(ctx context.Context, db *database.DB, userID uuid.UUID, useCase string) string {
	cacheKey := "assignedModel:" + useCase
	if v, ok := loadCached(userID, cacheKey); ok {
		return v.(string)
	}
	var model string
	db.Pool().QueryRow(ctx,
		`SELECT model FROM model_assignments WHERE user_id = $1 AND use_case = $2 LIMIT 1`,
		userID, useCase,
	).Scan(&model)
	storeCached(userID, cacheKey, model)
	return model
}

// ResolvePersona looks up the persona for a conversation:
// 1. If the conversation has a persona_id, use that persona.
// 2. Otherwise fall back to the user's default persona.
// Then fetches and decrypts the API key for the resolved provider.
//
// Optimized: reduces 4 serial queries to 2 using a CTE that resolves the
// persona (conversation-specific → default fallback) and user language in
// one round-trip, then fetches the API key in a second query.
func ResolvePersona(ctx context.Context, db *database.DB, convID, userID uuid.UUID, encryptionKey string) PersonaInfo {
	var info PersonaInfo
	var botName, userName, language string

	// Single query: resolve persona (conv-specific → default fallback) + user language.
	// users is the anchor row so user language is always returned even when no persona exists.
	db.Pool().QueryRow(ctx, `
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
	).Scan(&info.Provider, &info.Model, &info.SystemPrompt, &botName, &userName, &language)

	info.BotName = botName
	info.SystemPrompt = BuildSystemPrompt(botName, userName, language, info.SystemPrompt)

	// Apply defaults: empty provider/model → anthropic/claude-sonnet-4-5
	if info.Provider == "" {
		info.Provider = "anthropic"
	}
	if info.Model == "" {
		info.Model = "claude-sonnet-4-5"
	}

	// Fetch and decrypt API key for the resolved provider.
	var encrypted string
	if err := db.Pool().QueryRow(ctx,
		`SELECT COALESCE(api_key,'') FROM providers WHERE user_id = $1 AND provider = $2 LIMIT 1`,
		userID, info.Provider,
	).Scan(&encrypted); err == nil && encrypted != "" {
		info.APIKey, _ = crypto.Decrypt(encrypted, encryptionKey)
	}
	// No per-user key is fine — agent falls back to system-wide ANTHROPIC_OAUTH_TOKEN

	return info
}

// BuildSystemPrompt prepends bot/user name context and a language instruction to the raw system prompt.
// If all optional fields are empty, returns the raw prompt unchanged.
func BuildSystemPrompt(botName, userName, language, rawPrompt string) string {
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
