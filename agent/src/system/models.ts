export function getModelRegistry() {
  // pi-coding-agent discovers API keys from environment
  // Supported models: Claude, GPT-4, Gemini, etc.
  return {
    providers: {
      anthropic: {
        apiKey: process.env.ANTHROPIC_API_KEY,
      },
      openai: {
        apiKey: process.env.OPENAI_API_KEY,
      },
      google: {
        apiKey: process.env.GOOGLE_AI_API_KEY,
      },
    },
  };
}

export const DEFAULT_MODEL = "claude-sonnet-4-5";

export const MODEL_MAP: Record<string, string> = {
  // Anthropic — Claude 4.x
  "claude-sonnet-4-6":  "claude-sonnet-4-6",
  "claude-sonnet-4-5":  "claude-sonnet-4-5-20251001",
  "claude-opus-4-6":    "claude-opus-4-6",
  "claude-opus-4-5":    "claude-opus-4-5",
  "claude-haiku-4-5":   "claude-haiku-4-5-20251001",
  // OpenAI — GPT-5 series
  "gpt-5":              "gpt-5",
  "gpt-5.1":            "gpt-5.1",
  "gpt-5.2":            "gpt-5.2",
  "gpt-5.3-chat":       "gpt-5.3-chat",
  "gpt-5-mini":         "gpt-5-mini",
  "gpt-5-nano":         "gpt-5-nano",
  // OpenAI — reasoning
  "o4-mini":            "o4-mini",
  "o3":                 "o3",
  // Google — Gemini 2.5 / 3.x
  "gemini-2.5-flash":        "gemini-2.5-flash",
  "gemini-2.5-pro":          "gemini-2.5-pro",
  "gemini-3.0-flash":        "gemini-3.0-flash",
  "gemini-3.1-pro-preview":  "gemini-3.1-pro-preview",
  // Z.AI — GLM
  "glm-5":              "glm-5",
  "glm-4.7":            "glm-4.7",
  "glm-4.7-flash":      "glm-4.7-flash",
  "glm-4.7-flashx":     "glm-4.7-flashx",
};
