import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

import { gatewayFetch } from "@/lib/gateway"

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!body || (!body.title && body.persona_id === undefined)) {
    return NextResponse.json({ error: "title or persona_id is required" }, { status: 400 })
  }

  const patch: Record<string, string | null> = {}
  if (body.title !== undefined) patch.title = body.title
  if (body.persona_id !== undefined) patch.persona_id = body.persona_id

  const res = await gatewayFetch(`/api/v1/conversations/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    return NextResponse.json({ error: "update failed" }, { status: res.status })
  }
  return NextResponse.json(data)
}
