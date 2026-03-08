import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"

import { gatewayFetch } from "@/lib/gateway"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const qs = new URLSearchParams({ user_id: session.user.id })
  const res = await gatewayFetch(`/api/v1/ddays?${qs}`, { cache: "no-store" })
  const data = await res.json().catch(() => [])
  return NextResponse.json(data, { status: res.ok ? 200 : res.status })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const qs = new URLSearchParams({ user_id: session.user.id })
  const res = await gatewayFetch(`/api/v1/ddays?${qs}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  return NextResponse.json(data, { status: res.ok ? 201 : res.status })
}
