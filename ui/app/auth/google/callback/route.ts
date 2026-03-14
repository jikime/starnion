import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

import { gatewayFetch } from "@/lib/gateway"

/**
 * GET /auth/google/callback
 *
 * Google OAuth2 redirect target for the web flow.
 * Google redirects here with ?code=...&state=web:{userID} after the user grants permission.
 * This route calls the gateway to exchange the code for tokens, then redirects to the
 * integrations page with a success or error query param.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  const integrationsBase = new URL("/integrations", request.url).origin + "/integrations"

  if (error || !code || !state) {
    return NextResponse.redirect(`${integrationsBase}?error=google`)
  }

  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.redirect(`${integrationsBase}?error=google`)
  }

  const res = await gatewayFetch("/api/v1/integrations/google/callback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, state }),
  })

  if (res.ok) {
    return NextResponse.redirect(`${integrationsBase}?connected=google`)
  }

  return NextResponse.redirect(`${integrationsBase}?error=google`)
}
