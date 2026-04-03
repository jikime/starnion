import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"
import { gatewayFetch } from "@/lib/gateway"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  const res = await gatewayFetch("/api/v1/planner/roles", { cache: "no-store" })
  return NextResponse.json(await res.json().catch(() => []), { status: res.ok ? 200 : res.status })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  const body = await req.json()
  const res = await gatewayFetch("/api/v1/planner/roles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  return NextResponse.json(await res.json().catch(() => ({})), { status: res.ok ? 201 : res.status })
}
