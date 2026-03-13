import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"

import { gatewayFetch } from "@/lib/gateway"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const { searchParams } = req.nextUrl
  const qs = new URLSearchParams()
  const months = searchParams.get("months")
  if (months) qs.set("months", months)

  const res = await gatewayFetch(`/api/v1/statistics?${qs}`, { cache: "no-store" })
  const data = await res.json().catch(() => ({}))
  return NextResponse.json(data, { status: res.ok ? 200 : res.status })
}
