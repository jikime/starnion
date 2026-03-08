import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"

import { gatewayFetch } from "@/lib/gateway"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const qs = new URLSearchParams({ user_id: session.user.id })
  for (const [k, v] of searchParams.entries()) {
    if (k !== "user_id") qs.set(k, v)
  }

  const res = await gatewayFetch(`/api/v1/images?${qs}`, { cache: "no-store" })
  const data = await res.json().catch(() => [])
  return NextResponse.json(data, { status: res.ok ? 200 : res.status })
}
