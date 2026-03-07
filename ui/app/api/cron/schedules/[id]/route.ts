import { auth } from "@/auth"
import { NextResponse } from "next/server"

import { gatewayFetch } from "@/lib/gateway"

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json()
  const res = await gatewayFetch(
    `/api/v1/cron/schedules/${encodeURIComponent(id)}?user_id=${encodeURIComponent(session.user.id)}`,
    { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
  )
  const data = await res.json().catch(() => ({}))
  return NextResponse.json(data, { status: res.ok ? 200 : res.status })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const res = await gatewayFetch(
    `/api/v1/cron/schedules/${encodeURIComponent(id)}?user_id=${encodeURIComponent(session.user.id)}`,
    { method: "DELETE" }
  )
  const data = await res.json().catch(() => ({}))
  return NextResponse.json(data, { status: res.ok ? 200 : res.status })
}
