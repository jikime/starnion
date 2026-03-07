/**
 * POST /api/search/action
 *
 * Proxies web search requests to the backend SSE stream.
 * The agent uses the Tavily search tool to fetch real-time web results
 * and streams back a markdown-formatted summary.
 *
 * Body (JSON):
 *   query : string   (search query)
 */
import { auth } from "@/auth"
import { NextRequest, NextResponse } from "next/server"

import { gatewayFetch } from "@/lib/gateway"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  if (!body?.query) {
    return NextResponse.json({ error: "query is required" }, { status: 400 })
  }

  const payload = {
    user_id: session.user.id,
    message: `웹에서 다음 내용을 검색해줘: ${body.query as string}`,
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
