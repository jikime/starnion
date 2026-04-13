import { auth } from "@/lib/auth"
import { GATEWAY_API_URL } from "@/lib/starnion"

/**
 * Proxy the browser's WebSocket-token request to the gateway.
 *
 * Why not just return the NextAuth session's `gatewayToken`?
 *
 *   1. `gatewayToken` is a 24-hour login JWT issued by Login/Register/
 *      Refresh. Its claims carry the regular `*httpauth.Claims` shape
 *      and do NOT include a `type` field.
 *   2. The WebSocket upgrader (`gateway/internal/adapter/http/agentchat/
 *      ws.go`) enforces a narrow audience check:
 *          if claims["type"] != "ws" { return "token is not a ws token" }
 *      This hardening landed as part of the S-1 security fix to keep
 *      stolen long-lived login tokens from being replayed as permanent
 *      WebSocket credentials.
 *   3. The gateway exposes `GET /api/v1/ws-token` which mints a 1-hour
 *      short-lived JWT with `type: "ws"` specifically for WebSocket
 *      upgrades. That endpoint is the one we have to call.
 *
 * So this route is a thin authenticated pass-through: browser → web →
 * gateway `/api/v1/ws-token`, forwarding the session's login token as
 * the Bearer credential so the gateway can authenticate the user and
 * mint the narrower ws token.
 */
export async function GET() {
  const session = await auth()

  if (!session?.user?.id) {
    return Response.json({ error: "unauthorized" }, { status: 401 })
  }

  const gatewayToken = (session as typeof session & { gatewayToken?: string }).gatewayToken
  if (!gatewayToken) {
    return Response.json({ error: "no gateway token" }, { status: 401 })
  }

  try {
    const res = await fetch(`${GATEWAY_API_URL}/api/v1/ws-token`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${gatewayToken}`,
        Accept: "application/json",
      },
      // WS token mint is a tiny DB-less operation; a short timeout is
      // plenty and avoids hanging the UI when the gateway is down.
      signal: AbortSignal.timeout(5_000),
      cache: "no-store",
    })

    if (!res.ok) {
      const body = await res.text().catch(() => "")
      console.error(
        `[ws-token] gateway returned ${res.status}: ${body.slice(0, 200)}`,
      )
      return Response.json(
        { error: "failed to mint ws token" },
        { status: res.status === 401 ? 401 : 502 },
      )
    }

    // Gateway returns { token, expires_in, type } — we only need to
    // forward `token` to the browser, but pass through `expires_in`
    // too so the client can schedule a refresh before the 1-hour TTL.
    const data = (await res.json()) as {
      token?: string
      expires_in?: number
      type?: string
    }
    if (!data.token) {
      return Response.json({ error: "ws token missing" }, { status: 502 })
    }

    return Response.json({
      token: data.token,
      expires_in: data.expires_in,
      type: data.type,
    })
  } catch (err) {
    console.error("[ws-token] fetch failed:", (err as Error).message)
    return Response.json({ error: "gateway unreachable" }, { status: 502 })
  }
}
