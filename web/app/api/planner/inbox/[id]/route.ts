import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"
import { gatewayFetch } from "@/lib/gateway"

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  const { id } = await params
  const res = await gatewayFetch(`/api/v1/planner/inbox/${id}`, { method: "DELETE" })
  return new NextResponse(null, { status: res.ok ? 204 : res.status })
}
