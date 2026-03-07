"""LLM token pricing table and cost calculation utilities.

Prices are in USD per 1,000,000 tokens (same unit as api.ts).
Only includes models available in the project's models-view.tsx.
"""

from __future__ import annotations

# ---------------------------------------------------------------------------
# Model pricing table
# Format: { model_id: (input_$/M, output_$/M, cache_read_$/M, cache_write_$/M) }
# ---------------------------------------------------------------------------
_PRICING: dict[str, tuple[float, float, float, float]] = {
    # ── Gemini ──────────────────────────────────────────────────────────────
    "gemini-3.1-pro-preview":          (2.0,  12.0,  0.2,   0.0),
    # gemini-3.1-flash-lite-preview: text/image/video pricing (audio: $0.50 in/$0.05 cache)
    "gemini-3.1-flash-lite-preview":   (0.25,  1.5,  0.025, 0.0),
    # gemini-3.1-flash-image-preview: text output $3/M; image output $60/M (not token-tracked)
    "gemini-3.1-flash-image-preview":  (0.5,   3.0,  0.0,   0.0),
    "gemini-3-pro-preview":            (2.0,  12.0,  0.2,   0.0),
    "gemini-3-flash-preview":          (0.3,   2.5,  0.03,  0.05),
    "gemini-2.5-pro":                  (1.25, 10.0,  0.31,  0.0),
    "gemini-2.5-flash":                (0.3,   2.5,  0.075, 0.0),
    "gemini-2.5-flash-lite-preview-06-17": (0.1, 0.4, 0.025, 0.0),
    "gemini-2.0-flash":                (0.1,   0.4,  0.025, 1.0),
    "gemini-2.0-flash-001":            (0.1,   0.4,  0.025, 1.0),
    "gemini-2.0-flash-lite":           (0.075, 0.3,  0.019, 0.0),
    "gemini-2.0-flash-lite-preview-02-05": (0.0, 0.0, 0.0,  0.0),
    "gemini-2.0-pro-exp-02-05":        (0.0,   0.0,  0.0,   0.0),

    # ── Claude ──────────────────────────────────────────────────────────────
    "claude-sonnet-4-6":               (3.0,  15.0,  0.3,   3.75),
    "claude-sonnet-4-5-20250929":      (3.0,  15.0,  0.3,   3.75),
    "claude-haiku-4-5-20251001":       (1.0,   5.0,  0.1,   1.25),
    "claude-opus-4-6":                 (5.0,  25.0,  0.5,   6.25),
    "claude-opus-4-5-20251101":        (5.0,  25.0,  0.5,   6.25),
    "claude-sonnet-4-20250514":        (3.0,  15.0,  0.3,   3.75),
    "claude-opus-4-1-20250805":        (15.0, 75.0,  1.5,  18.75),
    "claude-opus-4-20250514":          (15.0, 75.0,  1.5,  18.75),
    "claude-3-7-sonnet-20250219":      (3.0,  15.0,  0.3,   3.75),
    "claude-3-5-sonnet-20241022":      (3.0,  15.0,  0.3,   3.75),
    "claude-3-5-haiku-20241022":       (0.8,   4.0,  0.08,  1.0),
    "claude-3-opus-20240229":          (15.0, 75.0,  1.5,  18.75),
    "claude-3-haiku-20240307":         (0.25,  1.25, 0.03,  0.3),

    # ── OpenAI / GPT ────────────────────────────────────────────────────────
    "gpt-5.2":                         (1.75, 14.0,  0.175, 0.0),
    "gpt-5.2-codex":                   (1.75, 14.0,  0.175, 0.0),
    "gpt-5.2-pro":                     (1.75, 14.0,  0.175, 0.0),
    "gpt-5.1":                         (1.25, 10.0,  0.125, 0.0),
    "gpt-5.1-2025-11-13":              (1.25, 10.0,  0.125, 0.0),
    "gpt-5.1-chat-latest":             (1.25, 10.0,  0.125, 0.0),
    "gpt-5.1-codex":                   (1.25, 10.0,  0.125, 0.0),
    "gpt-5.1-codex-max":               (1.25, 10.0,  0.125, 0.0),
    "gpt-5-2025-08-07":                (1.25, 10.0,  0.125, 0.0),
    "gpt-5-codex":                     (1.25, 10.0,  0.125, 0.0),
    "gpt-5-mini-2025-08-07":           (0.25,  2.0,  0.025, 0.0),
    "gpt-5-nano-2025-08-07":           (0.075, 0.6,  0.0,   0.0),
    "gpt-4.1":                         (2.0,   8.0,  0.5,   0.0),
    "gpt-4.1-mini":                    (0.4,   1.6,  0.1,   0.0),
    "gpt-4.1-nano":                    (0.1,   0.4,  0.025, 0.0),
    "gpt-4o":                          (2.5,  10.0,  1.25,  0.0),
    "gpt-4o-mini":                     (0.15,  0.6,  0.075, 0.0),

    # ── GLM (Zhipu AI / Z.AI) ───────────────────────────────────────────────
    # International pricing (USD) from https://docs.z.ai/guides/overview/pricing
    "glm-5":                           (1.0,   3.2,  0.2,   0.0),
    "glm-4.7":                         (0.6,   2.2,  0.11,  0.0),
    "glm-4.7-flash":                   (0.1,   0.3,  0.02,  0.0),  # estimated
    "glm-4.6":                         (0.6,   2.2,  0.11,  0.0),
    "glm-4.6v":                        (0.6,   2.2,  0.11,  0.0),  # vision variant
    "glm-4.5":                         (0.6,   2.2,  0.11,  0.0),
    "glm-4.5-air":                     (0.2,   1.2,  0.03,  0.0),
    "glm-4.5-flash":                   (0.05,  0.3,  0.01,  0.0),  # estimated
    "glm-4.5v":                        (0.6,   2.2,  0.11,  0.0),  # vision variant

    # ── Default fallback ─────────────────────────────────────────────────────
    "__default__":                     (1.0,   4.0,  0.1,   0.0),
}


def get_provider(model: str) -> str:
    """Infer provider name from model ID."""
    if model.startswith("gemini-") or model.startswith("models/gemini"):
        return "gemini"
    if model.startswith("claude-"):
        return "anthropic"
    if model.startswith("gpt-") or model.startswith("o1") or model.startswith("o3"):
        return "openai"
    if model.startswith("glm-"):
        return "zai"
    return "unknown"


def calculate_cost(
    model: str,
    input_tokens: int,
    output_tokens: int,
    cached_tokens: int = 0,
    cache_write_tokens: int = 0,
) -> float:
    """Return estimated cost in USD for a single LLM call.

    All token counts are raw integers; prices are per million tokens.

    Parameter semantics (normalised before calling):
    - ``input_tokens``      : standard + cache_read tokens combined.
                              (OpenAI/Gemini: raw total; Anthropic: standard + cache_read)
    - ``cached_tokens``     : the cache-read subset of ``input_tokens``
                              (billed at cache_read_price instead of inp_price).
    - ``cache_write_tokens``: tokens written to prompt cache this call
                              (billed at cache_write_price, separate from input_tokens).

    Formula:
        non_cached_input = input_tokens - cached_tokens   ← standard-rate tokens
        cost = non_cached_input × inp + output × out
             + cached × cache_read_price
             + cache_write × cache_write_price
    """
    pricing = _PRICING.get(model, _PRICING["__default__"])
    inp_price, out_price, cache_read_price, cache_write_price = pricing

    # Non-cached input tokens = total input minus cached reads
    non_cached_input = max(0, input_tokens - cached_tokens)

    cost = (
        non_cached_input    * inp_price         / 1_000_000
        + output_tokens     * out_price         / 1_000_000
        + cached_tokens     * cache_read_price  / 1_000_000
        + cache_write_tokens * cache_write_price / 1_000_000
    )
    return round(cost, 8)
