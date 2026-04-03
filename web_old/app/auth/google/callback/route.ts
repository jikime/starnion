import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

import { gatewayFetch } from "@/lib/gateway"

/**
 * GET /auth/google/callback
 *
 * Google OAuth2 redirect target (opened in a popup from skills page).
 * Google redirects here with ?code=...&state=... after the user grants permission.
 * This route calls the gateway to exchange the code for tokens, then returns
 * an HTML page that posts a message to the opener (skills page) and closes itself.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  if (error || !code || !state) {
    return popupResponse(false)
  }

  const session = await auth()
  if (!session?.user?.id) {
    return popupResponse(false)
  }

  const res = await gatewayFetch("/api/v1/integrations/google/callback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, state }),
  })

  return popupResponse(res.ok)
}

function popupResponse(success: boolean) {
  const messageType = success ? "google-oauth-success" : "google-oauth-error"
  const html = `<!DOCTYPE html>
<html>
<head><title>Google OAuth</title></head>
<body>
<script>
  if (window.opener) {
    window.opener.postMessage({ type: "${messageType}" }, "*");
  }
  window.close();
</script>
<p>${success ? "인증이 완료되었습니다. 이 창이 자동으로 닫힙니다." : "인증에 실패했습니다. 창을 닫고 다시 시도해주세요."}</p>
</body>
</html>`

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  })
}
