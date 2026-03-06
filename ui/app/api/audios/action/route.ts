/**
 * POST /api/audios/action
 *
 * Proxies audio STT (transcribe) and TTS (generate) requests to the backend SSE stream.
 * For STT: uploads the audio file to MinIO first, then asks the agent to transcribe it.
 * For TTS: sends a text prompt to the agent which calls the TTS tool.
 *
 * Body (multipart):
 *   action  : "transcribe" | "generate"
 *   message : string  (for generate: text to speak; for transcribe: optional extra instruction)
 *   file    : File?   (for transcribe: the audio file to transcribe)
 */
import { auth } from "@/auth"
import { NextRequest, NextResponse } from "next/server"

const API_URL = process.env.API_URL ?? "http://localhost:8080"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const formData = await req.formData().catch(() => null)
  if (!formData) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 })
  }

  const action = (formData.get("action") as string) ?? "transcribe"
  const message = (formData.get("message") as string) ?? ""
  const file = formData.get("file") as File | null

  let fileUrl = ""
  let fileName = ""

  // For transcription, upload the audio file to MinIO first.
  if (action === "transcribe" && file) {
    const uploadForm = new FormData()
    uploadForm.append("file", file)
    const uploadRes = await fetch(`${API_URL}/api/v1/upload`, {
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

  // Build the agent message.
  let agentMessage: string
  if (action === "transcribe") {
    agentMessage = message ? `이 음성을 텍스트로 변환해줘: ${message}` : "이 음성을 텍스트로 변환해줘"
  } else {
    // generate (TTS)
    agentMessage = message ? `다음 텍스트를 음성으로 변환해줘: ${message}` : message
  }

  const payload: Record<string, unknown> = {
    user_id: session.user.id,
    message: agentMessage,
  }

  if (fileUrl) {
    payload.files = [{ url: fileUrl, name: fileName, mime: file?.type ?? "audio/webm" }]
  }

  const upstream = await fetch(`${API_URL}/api/v1/chat/stream`, {
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
