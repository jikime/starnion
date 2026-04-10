import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"
import { gatewayFetch } from "@/lib/gateway"

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const res = await gatewayFetch(`/api/v1/cron/system/${id}/trigger`, { method: "POST" })
  const data = await res.json().catch(() => ({}))
  return NextResponse.json(data, { status: res.ok ? 200 : res.status })
}
