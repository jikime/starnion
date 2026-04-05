import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"

import { gatewayFetch } from "@/lib/gateway"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const qs = req.nextUrl.searchParams.toString()
  const res = await gatewayFetch(`/api/v1/logs/agent${qs ? `?${qs}` : ""}`, { cache: "no-store" })
  if (!res || !res.ok) {
    return NextResponse.json(
      { entries: [], total: 0, error: "agent log server unavailable" },
      { status: 503 }
    )
  }
  const data = await res.json().catch(() => ({ entries: [], total: 0 }))
  return NextResponse.json(data)
}
