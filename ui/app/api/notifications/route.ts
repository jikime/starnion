import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"
import { gatewayFetch } from "@/lib/gateway"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const limit = searchParams.get("limit") ?? "20"
  const unreadOnly = searchParams.get("unread_only") ?? "false"

  const res = await gatewayFetch(
    `/api/v1/notifications?limit=${limit}&unread_only=${unreadOnly}`,
    { cache: "no-store" },
  )
  const data = await res.json().catch(() => ({ notifications: [], unread_count: 0 }))
  return NextResponse.json(data, { status: res.status })
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const res = await gatewayFetch(`/api/v1/notifications/read`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  return NextResponse.json(data, { status: res.status })
}
