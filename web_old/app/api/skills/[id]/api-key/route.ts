import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"
import { gatewayFetch } from "@/lib/gateway"

type Params = { params: Promise<{ id: string }> }

// PUT /api/skills/:id/api-key — save or update the API key for a skill
export async function PUT(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body?.api_key) {
    return NextResponse.json({ error: "api_key is required" }, { status: 400 })
  }

  const res = await gatewayFetch(`/api/v1/skills/${encodeURIComponent(id)}/api-key`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: body.api_key }),
  })
  const data = await res.json().catch(() => ({}))
  return NextResponse.json(data, { status: res.ok ? 200 : res.status })
}

// DELETE /api/skills/:id/api-key — remove the API key for a skill
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const res = await gatewayFetch(`/api/v1/skills/${encodeURIComponent(id)}/api-key`, {
    method: "DELETE",
  })
  const data = await res.json().catch(() => ({}))
  return NextResponse.json(data, { status: res.ok ? 200 : res.status })
}
