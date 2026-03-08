import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"

import { gatewayFetch } from "@/lib/gateway"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const { searchParams } = req.nextUrl
  const days  = searchParams.get("days")  ?? "30"
  const page  = searchParams.get("page")  ?? "1"
  const limit = searchParams.get("limit") ?? "50"

  const qs = new URLSearchParams({
    user_id: session.user.id,
    days,
    page,
    limit,
  })

  const res = await gatewayFetch(`/api/v1/usage?${qs}`, { cache: "no-store" })
  const data = await res.json().catch(() => ({}))
  return NextResponse.json(data, { status: res.ok ? 200 : res.status })
}
