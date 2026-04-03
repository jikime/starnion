/**
 * logForwarder.ts
 * Patches console.log/warn/error to also forward log entries to the gateway's
 * internal log endpoint (POST /api/v1/internal/logs).
 * Fire-and-forget — errors are silently swallowed so logging never crashes the agent.
 *
 * Secret Redaction: applied to forwarded messages only (terminal output unchanged).
 */

const GATEWAY_HTTP_URL =
  process.env.GATEWAY_HTTP_URL ?? "http://localhost:8080"
const LOG_ENDPOINT = `${GATEWAY_HTTP_URL}/api/v1/internal/logs`

// ── Secret redaction patterns ────────────────────────────────────────────────
// Each entry: [regex, replacement]
// Applied left-to-right; more specific patterns first.
const REDACT_PATTERNS: [RegExp, string][] = [
  // Anthropic API keys  sk-ant-api03-…
  [/sk-ant-[A-Za-z0-9_-]{8,}/g, "sk-ant-***"],
  // OpenAI / generic sk-proj-… keys
  [/sk-proj-[A-Za-z0-9_-]{8,}/g, "sk-proj-***"],
  // Generic sk-… keys (≥20 chars after prefix)
  [/\bsk-[A-Za-z0-9_-]{20,}/g, "sk-***"],
  // Bearer tokens in Authorization headers
  [/Bearer\s+[A-Za-z0-9._-]{20,}/gi, "Bearer ***"],
  // JWT tokens (eyJ… base64url body)
  [/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)?/g, "eyJ***"],
  // DB / Redis / URL passwords:  user:password@host
  [/:\/\/([^:@\s]+):([^@\s]{3,})@/g, "://$1:***@"],
  // JSON field: "apiKey" / "api_key" / "apikey"
  [/("api[_-]?[Kk]ey"\s*:\s*")[^"]{4,}(")/g, "$1***$2"],
  // JSON field: "password" / "passwd" / "pass"
  [/("pass(?:word|wd|)"\s*:\s*")[^"]{3,}(")/g, "$1***$2"],
  // JSON field: "secret" / "secretKey" / "secret_key"
  [/("secret(?:[_-]?[Kk]ey)?"\s*:\s*")[^"]{4,}(")/g, "$1***$2"],
  // JSON field: "token" (values ≥20 chars to avoid matching short IDs)
  [/("token"\s*:\s*")[^"]{20,}(")/g, "$1***$2"],
  // JSON field: "access_key" / "accessKey"
  [/("access[_-]?[Kk]ey"\s*:\s*")[^"]{4,}(")/g, "$1***$2"],
  // JSON field: "auth_token" / "authToken"
  [/("auth[_-]?[Tt]oken"\s*:\s*")[^"]{4,}(")/g, "$1***$2"],
  // x-api-key header value patterns (key=value style in logs)
  [/x-api-key[=:\s]+[A-Za-z0-9._-]{8,}/gi, "x-api-key=***"],
];

function redactSecrets(message: string): string {
  let out = message;
  for (const [pattern, replacement] of REDACT_PATTERNS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

function forward(level: "info" | "warn" | "error", args: unknown[]) {
  const raw = args
    .map((a) =>
      typeof a === "string" ? a : JSON.stringify(a, null, 0)
    )
    .join(" ")

  const message = redactSecrets(raw);

  fetch(LOG_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ level, message, source: "agent" }),
  }).catch(() => {
    // silent — never let forwarding errors affect the agent
  })
}

export function patchConsole() {
  const origLog = console.log.bind(console)
  const origWarn = console.warn.bind(console)
  const origError = console.error.bind(console)

  console.log = (...args: unknown[]) => {
    origLog(...args)
    forward("info", args)
  }

  console.warn = (...args: unknown[]) => {
    origWarn(...args)
    forward("warn", args)
  }

  console.error = (...args: unknown[]) => {
    origError(...args)
    forward("error", args)
  }
}
