import { NextResponse } from "next/server"
import { gatewayFetch } from "@/lib/gateway"

export async function GET() {
  const res = await gatewayFetch("/api/v1/integrations/naver_map/client-config", {
    cache: "no-store",
  })
  const data = await res.json().catch(() => ({ configured: false }))
  return NextResponse.json(data, { status: res.ok ? 200 : res.status })
}
