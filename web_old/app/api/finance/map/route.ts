import { NextRequest, NextResponse } from "next/server"
import { gatewayFetch } from "@/lib/gateway"

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const qs = new URLSearchParams({
    ...(searchParams.get("year") ? { year: searchParams.get("year")! } : {}),
    ...(searchParams.get("month") ? { month: searchParams.get("month")! } : {}),
  })

  const res = await gatewayFetch(`/api/v1/finance/map?${qs}`, { cache: "no-store" })
  const data = await res.json().catch(() => ({}))
  return NextResponse.json(data, { status: res.ok ? 200 : res.status })
}
