import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

import { gatewayFetch } from "@/lib/gateway"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const { id } = await params

  const url = new URL(request.url)
  const before = url.searchParams.get("before") ?? ""
  const since = url.searchParams.get("since") ?? ""
  const limit = url.searchParams.get("limit") ?? "30"

  const qs = new URLSearchParams({ limit })
  if (before) qs.set("before", before)
  if (since) qs.set("since", since)

  const res = await gatewayFetch(`/api/v1/conversations/${id}/messages?${qs}`, { cache: "no-store" })
  const data = await res.json().catch(() => ({ messages: [], has_more: false, next_cursor: null }))
  if (!res.ok) {
    return NextResponse.json({ error: "history unavailable" }, { status: res.status })
  }
  return NextResponse.json(data)
}
