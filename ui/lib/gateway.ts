import { auth } from "@/lib/auth"

const API_URL = process.env.API_URL ?? "http://localhost:8080"

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
 * A 30-second AbortController timeout is applied to non-streaming requests so
 * that a hung gateway cannot stall the UI server indefinitely.
 * For SSE / streaming callers pass `signal` in `init` — the internal timeout
 * controller is linked to the caller's signal via AbortSignal.any().
 */
export async function gatewayFetch(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const session = await auth()
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> | undefined),
  }
  if (session?.gatewayToken) {
    headers["Authorization"] = `Bearer ${session.gatewayToken}`
  }

  // Build a timeout signal and optionally combine it with the caller's signal.
  const timeoutController = new AbortController()
  const timeoutId = setTimeout(() => timeoutController.abort(), GATEWAY_TIMEOUT_MS)

  const signals: AbortSignal[] = [timeoutController.signal]
  if (init?.signal instanceof AbortSignal) {
    signals.push(init.signal)
  }
  // AbortSignal.any() aborts as soon as the first signal fires.
  const signal = AbortSignal.any(signals)

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
    clearTimeout(timeoutId)
  }
}
