import { NextRequest } from "next/server"

import { gatewayFetch } from "@/lib/gateway"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const upstreamRes = await gatewayFetch(`/api/v1/logs/stream`, {
    cache: "no-store",
    headers: { Accept: "text/event-stream" },
    // @ts-expect-error -- Node.js fetch supports duplex
    duplex: "half",
  }).catch(() => null)

  if (!upstreamRes || !upstreamRes.ok || !upstreamRes.body) {
    return new Response("upstream unavailable", { status: 503 })
  }

  // Pipe SSE stream from Go gateway → browser
  const { readable, writable } = new TransformStream()
  upstreamRes.body.pipeTo(writable).catch(() => {})

  req.signal.addEventListener("abort", () => {
    upstreamRes.body?.cancel().catch(() => {})
  })

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
