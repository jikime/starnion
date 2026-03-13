import { auth } from "@/lib/auth"

const API_URL = process.env.API_URL ?? "http://localhost:8080"

/**
 * Wraps fetch for gateway requests.
 * Automatically attaches Authorization: Bearer <gatewayToken> from the
 * current NextAuth session when available.
 * Returns a synthetic 503 Response on network-level errors (ECONNREFUSED, etc.)
 * so callers can treat it uniformly with `!res.ok`.
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
  try {
    return await fetch(`${API_URL}${path}`, { ...init, headers })
  } catch {
    return new Response(JSON.stringify({ error: "gateway unavailable" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    })
  }
}
