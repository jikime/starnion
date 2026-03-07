/**
 * POST /api/images/action
 *
 * Proxies image generate / edit / analyze requests to the backend SSE stream.
 * Optionally uploads an attached file to MinIO first (for edit/analyze).
 *
 * Body (multipart):
 *   action   : "generate" | "edit" | "analyze"
 *   message  : string  (prompt or query)
 *   file     : File?   (for edit/analyze)
 */
import { auth } from "@/auth"
import { NextRequest, NextResponse } from "next/server"

import { gatewayFetch } from "@/lib/gateway"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const formData = await req.formData().catch(() => null)
  if (!formData) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 })
  }

  const action = (formData.get("action") as string) ?? "generate"
  const message = (formData.get("message") as string) ?? ""
  const file = formData.get("file") as File | null

  let fileUrl = ""
  let fileName = ""

  // Upload attached file to MinIO first.
  if (file) {
    const uploadForm = new FormData()
    uploadForm.append("file", file)
    const uploadRes = await gatewayFetch(`/api/v1/upload`, {
      method: "POST",
      body: uploadForm,
    }).catch(() => null)

    if (!uploadRes || !uploadRes.ok) {
      return NextResponse.json({ error: "file upload failed" }, { status: 502 })
    }

    const uploadData = await uploadRes.json().catch(() => null)
    if (!uploadData?.url) {
      return NextResponse.json({ error: "invalid upload response" }, { status: 502 })
    }

    fileUrl = uploadData.url as string
    fileName = uploadData.name as string
  }

  // Build the message for the agent depending on action.
  let agentMessage = message
  if (action === "analyze") {
    agentMessage = message ? `이미지를 분석해줘: ${message}` : "이미지를 분석해줘"
  }

  // Build request payload.
  const payload: Record<string, unknown> = {
    user_id: session.user.id,
    message: agentMessage,
  }

  if (fileUrl) {
    payload.files = [{ url: fileUrl, name: fileName, mime: file?.type ?? "image/png" }]
  }

  // Forward to backend SSE stream.
  const upstream = await gatewayFetch(`/api/v1/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => null)

  if (!upstream || !upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "stream failed" }, { status: 502 })
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
