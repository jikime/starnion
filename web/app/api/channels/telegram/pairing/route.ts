import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

import { gatewayFetch } from "@/lib/gateway"

// GET /api/channels/telegram/pairing  — list pending requests
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const res = await gatewayFetch(
    `/api/v1/channels/telegram/pairing`,
    { cache: "no-store" }
  )

  const data = await res.json().catch(() => ({ requests: [] }))
  if (!res.ok) {
    return NextResponse.json({ error: data.error ?? "요청에 실패했어요" }, { status: res.status })
  }
  return NextResponse.json(data)
}
