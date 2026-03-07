const API_URL = process.env.API_URL ?? "http://localhost:8080"

/**
 * Wraps fetch for gateway requests.
 * Returns a synthetic 503 Response on network-level errors (ECONNREFUSED, etc.)
 * so callers can treat it uniformly with `!res.ok`.
 */
export async function gatewayFetch(
  path: string,
  init?: RequestInit
): Promise<Response> {
  try {
    return await fetch(`${API_URL}${path}`, init)
  } catch {
    return new Response(JSON.stringify({ error: "gateway unavailable" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    })
  }
}
