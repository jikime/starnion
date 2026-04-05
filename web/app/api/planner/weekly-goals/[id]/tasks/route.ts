import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"
import { gatewayFetch } from "@/lib/gateway"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  const { id } = await params
  const res = await gatewayFetch(`/api/v1/planner/weekly-goals/${id}/tasks`, { cache: "no-store" })
  return NextResponse.json(await res.json().catch(() => []), { status: res.ok ? 200 : res.status })
}
