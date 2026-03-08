import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

import { gatewayFetch } from "@/lib/gateway"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const res = await gatewayFetch(
    `/api/v1/cron/schedules?user_id=${encodeURIComponent(session.user.id)}`,
    { cache: "no-store" }
  )
  const data = await res.json().catch(() => [])
  return NextResponse.json(data, { status: res.ok ? 200 : res.status })
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  const res = await gatewayFetch(
    `/api/v1/cron/schedules?user_id=${encodeURIComponent(session.user.id)}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
  )
  const data = await res.json().catch(() => ({}))
  return NextResponse.json(data, { status: res.ok ? 200 : res.status })
}
