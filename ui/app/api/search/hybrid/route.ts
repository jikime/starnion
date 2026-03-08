import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"

import { gatewayFetch } from "@/lib/gateway"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const q = searchParams.get("q") ?? ""
  const limit = searchParams.get("limit") ?? "10"

  if (!q.trim()) return NextResponse.json([])

  const qs = new URLSearchParams({ user_id: session.user.id, q, limit })
  const res = await gatewayFetch(`/api/v1/search/hybrid?${qs}`, {
    cache: "no-store",
  }).catch(() => null)

  if (!res || !res.ok) return NextResponse.json([])
  const data = await res.json().catch(() => [])
  return NextResponse.json(data)
}
