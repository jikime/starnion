import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

import { gatewayFetch } from "@/lib/gateway"

export async function PUT(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const apiKey: string = body?.api_key ?? ""
  if (!apiKey) {
    return NextResponse.json({ error: "api_key required" }, { status: 400 })
  }

  const res = await gatewayFetch(`/api/v1/integrations/tavily`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey }),
  })
  const data = await res.json().catch(() => ({}))
  return NextResponse.json(data, { status: res.ok ? 200 : res.status })
}

export async function DELETE() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const res = await gatewayFetch(
    `/api/v1/integrations/tavily`,
    { method: "DELETE" }
  )
  const data = await res.json().catch(() => ({}))
  return NextResponse.json(data, { status: res.ok ? 200 : res.status })
}
