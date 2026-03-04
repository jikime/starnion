import { auth } from "@/auth"
import { NextResponse } from "next/server"

const API_URL = process.env.API_URL ?? "http://localhost:8080"

// AI SDK v6 UIMessage part shape (subset we need)
type UIPart = { type: string; text?: string }
type UIMsg = { role: string; parts?: UIPart[]; content?: string }

function extractText(msg: UIMsg): string {
  if (Array.isArray(msg.parts)) {
    return msg.parts
      .filter((p) => p.type === "text")
      .map((p) => p.text ?? "")
      .join("")
  }
  return typeof msg.content === "string" ? msg.content : ""
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
  if (!messageText) {
    return NextResponse.json({ error: "empty message" }, { status: 400 })
  }

  const threadId: string = body.thread_id ?? ""

  // Forward to Go gateway SSE stream endpoint.
  const upstream = await fetch(`${API_URL}/api/v1/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: session.user.id,
      message: messageText,
      thread_id: threadId,
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
