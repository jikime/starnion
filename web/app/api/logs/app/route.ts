import { NextRequest, NextResponse } from "next/server"

import { gatewayFetch } from "@/lib/gateway"

export async function GET(req: NextRequest) {
  const qs = req.nextUrl.searchParams.toString()
  const res = await gatewayFetch(`/api/v1/logs/app${qs ? `?${qs}` : ""}`, {
    cache: "no-store",
  })
  const data = await res.json().catch(() => ({ entries: [], total: 0 }))
  return NextResponse.json(data, { status: res.ok ? 200 : res.status })
}
