/**
 * POST /api/audios/action
 *
 * Proxies audio STT / TTS requests to the backend SSE stream.
 * The caller is responsible for uploading the file and saving
 * the metadata BEFORE calling this route.
 *
 * Body (JSON):
 *   action    : "transcribe" | "generate"
 *   file_url  : string   (MinIO URL; required for transcribe)
 *   file_name : string
 *   file_mime : string
 *   message   : string   (text for TTS; optional extra instruction for STT)
 */
import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"

import { gatewayFetch } from "@/lib/gateway"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 })
  }

  const { action = "transcribe", file_url, file_name, file_mime, message = "" } = body as {
    action?: string
    file_url?: string
    file_name?: string
    file_mime?: string
    message?: string
  }

  let agentMessage: string
  if (action === "transcribe") {
    agentMessage = message ? `이 음성을 텍스트로 변환해줘: ${message}` : "이 음성을 텍스트로 변환해줘"
  } else {
    agentMessage = message ? `다음 텍스트를 음성으로 변환해줘: ${message}` : message
  }

  const payload: Record<string, unknown> = {
    message: agentMessage,
  }

  if (file_url) {
    payload.files = [{ url: file_url, name: file_name ?? "audio.webm", mime: file_mime ?? "audio/webm" }]
  }

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
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
