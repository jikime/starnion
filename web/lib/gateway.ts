import { auth } from "@/lib/auth"
import { GATEWAY_API_URL } from "@/lib/starnion"

const API_URL = GATEWAY_API_URL

// Default connect/response timeout for non-streaming requests (ms).
// SSE callers pass their own AbortSignal via init.signal and should set
// GATEWAY_STREAM_TIMEOUT_MS (or leave it unlimited — the nginx
// proxy_read_timeout acts as the wall-clock ceiling).
const GATEWAY_TIMEOUT_MS = parseInt(process.env.GATEWAY_TIMEOUT_MS ?? "30000", 10)

/**
 * Wraps fetch for gateway requests.
 * Automatically attaches Authorization: Bearer <gatewayToken> from the
 * current NextAuth session when available.
 * Returns a synthetic 503 Response on network-level errors (ECONNREFUSED, etc.)
 * so callers can treat it uniformly with `!res.ok`.
 *
 * Timeout behaviour:
 * - No caller signal → a GATEWAY_TIMEOUT_MS (default 30 s) AbortController is
 *   created so a hung gateway cannot stall the UI server indefinitely.
 * - Caller passes signal → the internal timeout is skipped entirely; the caller
 *   owns the lifetime (e.g. SSE / long-running vision requests that can take
 *   several minutes).
 */
export async function gatewayFetch(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const session = await auth()
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> | undefined),
  }
  const gwToken = (session as typeof session & { gatewayToken?: string })?.gatewayToken
  if (gwToken) {
    headers["Authorization"] = `Bearer ${gwToken}`
  }

  // When the caller supplies its own AbortSignal (e.g. SSE streaming routes),
  // use it directly and skip the internal timeout — the caller manages the
  // connection lifetime.  For plain REST calls apply the default timeout so a
  // hung gateway cannot stall the Next.js server indefinitely.
  const callerSignal = init?.signal instanceof AbortSignal ? init.signal : null
  let signal: AbortSignal
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  if (callerSignal) {
    signal = callerSignal
  } else {
    const timeoutController = new AbortController()
    timeoutId = setTimeout(() => timeoutController.abort(), GATEWAY_TIMEOUT_MS)
    signal = timeoutController.signal
  }

  try {
    return await fetch(`${API_URL}${path}`, { ...init, headers, signal })
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return new Response(JSON.stringify({ error: "gateway timeout" }), {
        status: 504,
        headers: { "Content-Type": "application/json" },
      })
    }
    return new Response(JSON.stringify({ error: "gateway unavailable" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    })
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId)
  }
}
