import { auth } from "@/auth"
import { NextRequest, NextResponse } from "next/server"

import { gatewayFetch } from "@/lib/gateway"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const { searchParams } = req.nextUrl
  const qs = new URLSearchParams({ user_id: session.user.id })
  const type = searchParams.get("type")
  const limit = searchParams.get("limit") ?? "20"
  const offset = searchParams.get("offset") ?? "0"
  if (type) qs.set("type", type)
  qs.set("limit", limit)
  qs.set("offset", offset)

  const res = await gatewayFetch(`/api/v1/reports?${qs}`, { cache: "no-store" })
  const data = await res.json().catch(() => [])
  return NextResponse.json(data, { status: res.ok ? 200 : res.status })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const res = await gatewayFetch(`/api/v1/reports/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: session.user.id, report_type: body.report_type }),
  })
  const data = await res.json().catch(() => ({}))
  return NextResponse.json(data, { status: res.ok ? 200 : res.status })
}
