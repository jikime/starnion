import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

import { gatewayFetch } from "@/lib/gateway"

// AI SDK v6 UIMessage part shape (subset we need)
type TextPart = { type: "text"; text: string }
type FilePart = { type: "file"; url: string; mediaType: string }
type UIPart = TextPart | FilePart | { type: string }
type UIMsg = { role: string; parts?: UIPart[]; content?: string }

function extractText(msg: UIMsg): string {
  if (Array.isArray(msg.parts)) {
    return msg.parts
      .filter((p): p is TextPart => p.type === "text")
      .map((p) => p.text)
      .join("")
  }
  return typeof msg.content === "string" ? msg.content : ""
}

function extractFiles(msg: UIMsg): Array<{ url: string; name: string; mime: string }> {
  if (!Array.isArray(msg.parts)) return []
  return msg.parts
    .filter((p): p is FilePart => p.type === "file" && typeof (p as FilePart).url === "string")
    .map((p) => ({
      url: p.url,
      name: p.url.split("/").pop() ?? "file",
      mime: p.mediaType,
    }))
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 })
  }

  // AI SDK v6 sends UIMessage[] (parts array) in body.messages.
  const messages: UIMsg[] = body.messages ?? []
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user")
  if (!lastUserMsg) {
    return NextResponse.json({ error: "no user message" }, { status: 400 })
  }

  const messageText = extractText(lastUserMsg)
  const files = extractFiles(lastUserMsg)

  if (!messageText && files.length === 0) {
    return NextResponse.json({ error: "empty message" }, { status: 400 })
  }

  const threadId: string = body.thread_id ?? ""

  // Forward to Go gateway SSE stream endpoint.
  const upstream = await gatewayFetch(`/api/v1/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: messageText,
      thread_id: threadId,
      ...(files.length > 0 && { files }),
    }),
  }).catch(() => null)

  if (!upstream || !upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "stream failed" }, { status: 502 })
  }

  // Transparent SSE tunnel — DefaultChatTransport reads this with EventSourceParserStream.
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
