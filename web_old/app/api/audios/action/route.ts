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

  const { action = "transcribe", file_url, language = "ko", text, voice, model } = body as {
    action?: string
    file_url?: string
    language?: string
    text?: string
    voice?: string
    model?: string
  }

  if (action === "transcribe") {
    if (!file_url) {
      return NextResponse.json({ error: "file_url is required" }, { status: 400 })
    }
    // Delegate directly to the gateway Whisper transcription endpoint.
    const upstream = await gatewayFetch(`/api/v1/audios/transcribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_url, language }),
    }).catch(() => null)

    if (!upstream) {
      return NextResponse.json({ error: "transcription service unavailable" }, { status: 502 })
    }
    const data = await upstream.json().catch(() => null)
    if (!upstream.ok) {
      return NextResponse.json(data ?? { error: "transcription failed" }, { status: upstream.status })
    }
    return NextResponse.json(data)
  }

  if (action === "generate") {
    if (!text?.trim()) {
      return NextResponse.json({ error: "text is required" }, { status: 400 })
    }
    // Proxy TTS request to gateway (streams audio/mpeg).
    const upstream = await gatewayFetch(`/api/v1/audios/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice: voice ?? "nova", model: model ?? "tts-1" }),
    }).catch(() => null)

    if (!upstream) {
      return NextResponse.json({ error: "TTS service unavailable" }, { status: 502 })
    }
    if (!upstream.ok) {
      const err = await upstream.json().catch(() => null)
      return NextResponse.json(err ?? { error: "TTS failed" }, { status: upstream.status })
    }
    // Stream audio/mpeg binary response back to the client.
    return new NextResponse(upstream.body, {
      headers: { "Content-Type": "audio/mpeg" },
    })
  }

  return NextResponse.json({ error: "unsupported action" }, { status: 400 })
}
