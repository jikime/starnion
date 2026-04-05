import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"

import { gatewayFetch } from "@/lib/gateway"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const qs = req.nextUrl.searchParams.toString()
  const res = await gatewayFetch(`/api/v1/logs/app${qs ? `?${qs}` : ""}`, {
    cache: "no-store",
  })
  const data = await res.json().catch(() => ({ entries: [], total: 0 }))
  return NextResponse.json(data, { status: res.ok ? 200 : res.status })
}
