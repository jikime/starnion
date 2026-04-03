import { auth } from "@/lib/auth"

export async function GET() {
  const session = await auth()

  if (!session?.user?.id) {
    return Response.json({ error: "unauthorized" }, { status: 401 })
  }

  // Re-use the gateway JWT from the session (signed by the gateway's JWT secret).
  // This token already validates against the Gateway's WS auth handler.
  const gatewayToken = (session as typeof session & { gatewayToken?: string }).gatewayToken
  if (!gatewayToken) {
    return Response.json({ error: "no gateway token" }, { status: 401 })
  }

  return Response.json({ token: gatewayToken })
}
