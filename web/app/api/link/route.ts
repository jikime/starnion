import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"
import { gatewayFetch } from "@/lib/gateway"

// POST /api/link  { code: "A3F9C2" }
// Proxies to gateway POST /api/v1/telegram/link-code
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body?.code) {
    return NextResponse.json({ error: "code is required" }, { status: 400 })
  }

  const res = await gatewayFetch("/api/v1/telegram/link-code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: body.code }),
  })

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    return NextResponse.json(
      { error: (data as { error?: string }).error ?? "링크 코드가 올바르지 않거나 만료되었어요" },
      { status: res.status }
    )
  }

  return NextResponse.json(data)
}
