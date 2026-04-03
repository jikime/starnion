/**
 * LLM Fallback Chain
 *
 * Implements a 4-tier LLM provider fallback strategy inspired by WorldMonitor:
 *   Tier 1: Groq     — fast cloud inference (free tier / cheap)
 *   Tier 2: OpenRouter — versatile multi-model gateway
 *   Tier 3: OpenAI   — GPT models (if configured)
 *   Tier 4: Anthropic — default built-in (always available)
 *
 * The chain is built on the gateway side from the user's configured providers
 * and sent via gRPC metadata as JSON. The agent selects the first resolvable
 * provider+model combination using pi-ai's getModel().
 */

import { getModel } from "@mariozechner/pi-ai";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FallbackProvider {
  /** Provider name: "groq", "openrouter", "openai", "anthropic" */
  provider: string;
  /** Decrypted API key for this provider */
  api_key: string;
  /** Provider-specific model ID to use */
  model: string;
  /** Optional custom base URL (e.g. for self-hosted proxies) */
  base_url?: string;
}

// ── Provider defaults ─────────────────────────────────────────────────────────

/**
 * Default model to use when a provider is in the fallback chain but
 * no specific model override is configured.
 */
export const PROVIDER_DEFAULT_MODELS: Record<string, string> = {
  groq:        "llama-3.3-70b-versatile",
  openrouter:  "meta-llama/llama-3.3-70b-instruct",
  openai:      "gpt-4o-mini",
  anthropic:   "claude-haiku-4-5",
};

/**
 * Priority order for automatic fallback chain construction.
 * Lower index = tried first.
 */
export const FALLBACK_PRIORITY: string[] = ["groq", "openrouter", "openai", "anthropic"];

// ── Resolution logic ──────────────────────────────────────────────────────────

/**
 * Checks whether pi-ai can resolve a specific provider+model combination.
 * Returns the model object if resolvable, null otherwise.
 */
export function resolveProviderModel(provider: string, model: string) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return getModel(provider as any, model as any) ?? null;
  } catch {
    return null;
  }
}

/**
 * Given an ordered list of fallback providers, returns the first entry
 * whose provider+model is resolvable by pi-ai.
 *
 * Returns null if no provider in the chain is usable.
 */
export function selectFirstResolvable(
  chain: FallbackProvider[]
): { provider: FallbackProvider; index: number } | null {
  for (let i = 0; i < chain.length; i++) {
    const fb = chain[i];
    if (resolveProviderModel(fb.provider, fb.model)) {
      return { provider: fb, index: i };
    }
    console.log(
      `[llm-fallback] provider=${fb.provider} model=${fb.model} not resolvable — skipping`
    );
  }
  return null;
}

/**
 * Parses a JSON-encoded fallback chain from gRPC metadata.
 * Returns an empty array on parse failure.
 */
export function parseFallbackChain(raw: string): FallbackProvider[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is FallbackProvider =>
        typeof e === "object" &&
        e !== null &&
        typeof e.provider === "string" &&
        typeof e.api_key === "string" &&
        typeof e.model === "string"
    );
  } catch {
    return [];
  }
}
