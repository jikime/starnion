import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"
import { gatewayFetch } from "@/lib/gateway"

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  const { id } = await params
  const res = await gatewayFetch(`/api/v1/planner/tasks/${id}/forward`, { method: "POST" })
  return NextResponse.json(await res.json().catch(() => ({})), { status: res.ok ? 201 : res.status })
}
