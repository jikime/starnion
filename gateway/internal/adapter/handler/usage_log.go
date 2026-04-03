package handler

import (
	"context"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/newstarnion/gateway/internal/infrastructure/database"
)

// modelPrice holds per-million-token prices for a model.
type modelPrice struct {
	input  float64 // USD per 1M input tokens
	output float64 // USD per 1M output tokens
	cache  float64 // USD per 1M cached-read tokens (0 = not supported)
}

// modelPricingTable maps lowercase model name substrings to pricing.
// Prices are in USD per 1,000,000 tokens (as of 2026-Q1).
// Order matters: more specific entries must come before broader ones.
var modelPricingTable = []struct {
	match string
	price modelPrice
}{
	// ── Anthropic Claude ─────────────────────────────────────────────────────
	{match: "claude-opus-4",             price: modelPrice{input: 15.00, output: 75.00, cache: 1.50}},
	{match: "claude-opus-3",             price: modelPrice{input: 15.00, output: 75.00, cache: 1.50}},
	{match: "claude-sonnet-4",           price: modelPrice{input:  3.00, output: 15.00, cache: 0.30}},
	{match: "claude-sonnet-3-7",         price: modelPrice{input:  3.00, output: 15.00, cache: 0.30}},
	{match: "claude-sonnet-3-5",         price: modelPrice{input:  3.00, output: 15.00, cache: 0.30}},
	{match: "3-7-sonnet",                price: modelPrice{input:  3.00, output: 15.00, cache: 0.30}},
	{match: "3-5-sonnet",                price: modelPrice{input:  3.00, output: 15.00, cache: 0.30}},
	{match: "claude-haiku-4",            price: modelPrice{input:  0.80, output:  4.00, cache: 0.08}},
	{match: "claude-haiku-3-5",          price: modelPrice{input:  0.80, output:  4.00, cache: 0.08}},
	{match: "3-5-haiku",                 price: modelPrice{input:  0.80, output:  4.00, cache: 0.08}},
	{match: "claude-haiku-3",            price: modelPrice{input:  0.25, output:  1.25, cache: 0.03}},
	{match: "3-haiku",                   price: modelPrice{input:  0.25, output:  1.25, cache: 0.03}},
	{match: "3-opus",                    price: modelPrice{input: 15.00, output: 75.00, cache: 1.50}},

	// ── Google Gemini ─────────────────────────────────────────────────────────
	// 3.x series (newest)
	{match: "gemini-3.1-pro",            price: modelPrice{input:  2.00, output: 12.00, cache: 0.20}},
	{match: "gemini-3.1-flash",          price: modelPrice{input:  0.50, output:  3.00, cache: 0.05}},
	{match: "gemini-3-pro",              price: modelPrice{input:  2.00, output: 12.00, cache: 0.20}},
	{match: "gemini-3-flash",            price: modelPrice{input:  0.50, output:  3.00, cache: 0.05}},
	// 2.5 series
	{match: "gemini-2.5-pro",            price: modelPrice{input:  1.25, output: 10.00, cache: 0.125}},
	{match: "gemini-2.5-flash",          price: modelPrice{input:  0.30, output:  2.50, cache: 0.03}},
	// 2.0 series (more specific before generic flash)
	{match: "gemini-2.0-flash-thinking", price: modelPrice{input:  0.00, output:  3.50}},
	{match: "gemini-2.0-flash-lite",     price: modelPrice{input:  0.075, output: 0.30}},
	{match: "gemini-2.0-flash",          price: modelPrice{input:  0.10, output:  0.40, cache: 0.025}},
	// 1.5 series
	{match: "gemini-1.5-pro",            price: modelPrice{input:  1.25, output:  5.00, cache: 0.3125}},
	{match: "gemini-1.5-flash",          price: modelPrice{input:  0.075, output: 0.30, cache: 0.01875}},

	// ── OpenAI ────────────────────────────────────────────────────────────────
	// GPT-5 series (more specific first)
	{match: "gpt-5.3",                   price: modelPrice{input:  1.75, output: 14.00, cache: 0.175}},
	{match: "gpt-5.2",                   price: modelPrice{input:  0.875, output: 7.00, cache: 0.175}},
	{match: "gpt-5.1",                   price: modelPrice{input:  0.625, output: 5.00, cache: 0.125}},
	{match: "gpt-5",                     price: modelPrice{input:  0.625, output: 5.00, cache: 0.125}},
	// GPT-4.1 series
	{match: "gpt-4.1-nano",              price: modelPrice{input:  0.10, output:  0.40, cache: 0.025}},
	{match: "gpt-4.1-mini",              price: modelPrice{input:  0.40, output:  1.60, cache: 0.10}},
	{match: "gpt-4.1",                   price: modelPrice{input:  2.00, output:  8.00, cache: 0.50}},
	// GPT-4o series
	{match: "gpt-4o-mini",               price: modelPrice{input:  0.15, output:  0.60, cache: 0.075}},
	{match: "gpt-4o",                    price: modelPrice{input:  2.50, output: 10.00, cache: 1.25}},
	// Legacy GPT-4
	{match: "gpt-4-turbo",               price: modelPrice{input: 10.00, output: 30.00}},
	{match: "gpt-4",                     price: modelPrice{input: 30.00, output: 60.00}},
	{match: "gpt-3.5-turbo",             price: modelPrice{input:  0.50, output:  1.50}},
	// Reasoning models
	{match: "o4-mini",                   price: modelPrice{input:  1.10, output:  4.40, cache: 0.275}},
	{match: "o3-mini",                   price: modelPrice{input:  1.10, output:  4.40}},
	{match: "o3",                        price: modelPrice{input:  2.00, output:  8.00, cache: 0.50}},
	{match: "o1-mini",                   price: modelPrice{input:  1.10, output:  4.40}},
	{match: "o1",                        price: modelPrice{input: 15.00, output: 60.00}},

	// ── Z.AI — GLM series ─────────────────────────────────────────────────────
	{match: "glm-5",                     price: modelPrice{input:  1.00, output:  3.20}},
	{match: "glm-4.7-flash",             price: modelPrice{input:  0.00, output:  0.00}},
	{match: "glm-4.7",                   price: modelPrice{input:  0.60, output:  2.20}},
	{match: "glm-4.6v",                  price: modelPrice{input:  0.30, output:  0.90}},
	{match: "glm-4.6",                   price: modelPrice{input:  0.60, output:  2.20}},
	{match: "glm-4.5-flash",             price: modelPrice{input:  0.00, output:  0.00}},
	{match: "glm-4.5-air",               price: modelPrice{input:  0.20, output:  1.10}},
	{match: "glm-4.5v",                  price: modelPrice{input:  0.60, output:  1.80}},
	{match: "glm-4.5",                   price: modelPrice{input:  0.60, output:  2.20}},
}

// calcCost returns the estimated USD cost for the given token counts.
// Returns 0 if the model is not in the pricing table (e.g. local/ollama models).
func calcCost(model string, inputTokens, cachedTokens, outputTokens int) float64 {
	m := strings.ToLower(model)
	for _, entry := range modelPricingTable {
		if strings.Contains(m, entry.match) {
			cost := (float64(outputTokens)*entry.price.output) / 1_000_000
			if entry.price.cache > 0 && cachedTokens > 0 {
				// cached tokens billed at cache rate; non-cached input at full rate
				nonCached := inputTokens - cachedTokens
				if nonCached < 0 {
					nonCached = 0
				}
				cost += (float64(nonCached)*entry.price.input + float64(cachedTokens)*entry.price.cache) / 1_000_000
			} else {
				cost += float64(inputTokens) * entry.price.input / 1_000_000
			}
			return cost
		}
	}
	return 0
}

// providerFromModel derives the provider name from a model identifier.
// Falls back to "unknown" if no prefix matches.
func providerFromModel(model string) string {
	m := strings.ToLower(model)
	switch {
	case strings.HasPrefix(m, "gemini"):
		return "gemini"
	case strings.HasPrefix(m, "claude"):
		return "anthropic"
	case strings.HasPrefix(m, "gpt"), strings.HasPrefix(m, "o1"), strings.HasPrefix(m, "o3"), strings.HasPrefix(m, "o4"):
		return "openai"
	case strings.HasPrefix(m, "glm"):
		return "zai"
	case strings.HasPrefix(m, "ollama") || strings.Contains(m, ":"):
		return "ollama"
	default:
		return "unknown"
	}
}

// lookupUserPrice queries model_pricing for a user-specific rate.
// Returns (inputUSD, outputUSD, cacheInputUSD, found).
func lookupUserPrice(ctx context.Context, db *database.DB, userID uuid.UUID, model string) (float64, float64, float64, bool) {
	var inputUSD, outputUSD, cacheInputUSD float64
	err := db.QueryRowContext(ctx,
		`SELECT input_usd, output_usd, cache_input_usd FROM model_pricing WHERE user_id = $1 AND model = $2`,
		userID, model,
	).Scan(&inputUSD, &outputUSD, &cacheInputUSD)
	if err != nil {
		return 0, 0, 0, false
	}
	return inputUSD, outputUSD, cacheInputUSD, true
}

// insertUsageLog saves a single LLM call record to the usage_logs table.
// provider is derived from model when empty.
// agentCostUSD is the pre-calculated cost from the agent middleware (preferred).
// Falls back to user-defined pricing, then built-in pricing table.
func insertUsageLog(ctx context.Context, db *database.DB, userID uuid.UUID, model, provider string, inputTokens, cachedTokens, outputTokens int, callType string, agentCostUSD float64) {
	if inputTokens == 0 && outputTokens == 0 {
		return
	}
	if provider == "" {
		provider = providerFromModel(model)
	}

	var costUSD float64
	switch {
	case agentCostUSD > 0:
		// 1순위: agent middleware의 정확한 계산값 (Claude Code 구독 포함)
		costUSD = agentCostUSD
	default:
		if inUSD, outUSD, cacheUSD, ok := lookupUserPrice(ctx, db, userID, model); ok {
			// 2순위: 사용자 정의 가격 테이블
			nonCached := inputTokens - cachedTokens
			if nonCached < 0 {
				nonCached = 0
			}
			if cacheUSD > 0 && cachedTokens > 0 {
				costUSD = (float64(nonCached)*inUSD + float64(cachedTokens)*cacheUSD + float64(outputTokens)*outUSD) / 1_000_000
			} else {
				costUSD = (float64(inputTokens)*inUSD + float64(outputTokens)*outUSD) / 1_000_000
			}
		} else {
			// 3순위: 내장 가격 테이블 (substring match)
			costUSD = calcCost(model, inputTokens, cachedTokens, outputTokens)
		}
	}

	db.ExecContext(ctx,
		`INSERT INTO usage_logs (user_id, model, provider, input_tokens, output_tokens, cached_tokens, cost_usd, status, call_type, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, 'success', $8, $9)`,
		userID, model, provider, inputTokens, outputTokens, cachedTokens, costUSD, callType, time.Now(),
	)
}
