import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

import { gatewayFetch } from "@/lib/gateway"

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const before = searchParams.get("before")
  const gatewayUrl = before
    ? `/api/v1/conversations?before=${encodeURIComponent(before)}`
    : `/api/v1/conversations`

  const res = await gatewayFetch(gatewayUrl, { cache: "no-store" })
  const data = await res.json().catch(() => ({ conversations: [], has_more: false, next_cursor: "" }))
  if (!res.ok) {
    return NextResponse.json({ error: "failed to fetch conversations" }, { status: res.status })
  }
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const title: string = body?.title ?? "새 대화"

  const res = await gatewayFetch(`/api/v1/conversations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    return NextResponse.json({ error: "failed to create conversation" }, { status: res.status })
  }
  return NextResponse.json(data, { status: 201 })
}
