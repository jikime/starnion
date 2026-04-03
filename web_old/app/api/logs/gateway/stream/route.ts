import { NextRequest } from "next/server"

import { gatewayFetch } from "@/lib/gateway"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const upstreamRes = await gatewayFetch(`/api/v1/logs/stream`, {
    cache: "no-store",
    headers: { Accept: "text/event-stream" },
    // @ts-expect-error -- Node.js fetch supports duplex
    duplex: "half",
    signal: req.signal, // propagate disconnect; caller-owned signal skips internal timeout
  }).catch(() => null)

  if (!upstreamRes || !upstreamRes.ok || !upstreamRes.body) {
    return new Response("upstream unavailable", { status: 503 })
  }

  // Pipe SSE stream from Go gateway → browser.
  // When the browser disconnects (req.signal aborts) we must cancel the
  // upstream body *and* close the writable side of the TransformStream.
  // Cancelling only the source leaves the writable writer open, which
  // prevents the readable from signalling EOF to the browser.
  const { readable, writable } = new TransformStream()
  const writer = writable.getWriter()

  upstreamRes.body
    .pipeTo(writable)
    .catch(() => writer.close().catch(() => {}))

  req.signal.addEventListener("abort", () => {
    upstreamRes.body?.cancel().catch(() => {})
    writer.close().catch(() => {})
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
