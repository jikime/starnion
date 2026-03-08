import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

import { gatewayFetch } from "@/lib/gateway"

export async function PUT(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const clientId: string = body?.client_id ?? ""
  const clientSecret: string = body?.client_secret ?? ""
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: "client_id and client_secret required" }, { status: 400 })
  }

  // Store as "client_id:client_secret" in api_key column
  const apiKey = `${clientId}:${clientSecret}`

  const res = await gatewayFetch(`/api/v1/integrations/naver_search`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: session.user.id, api_key: apiKey }),
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
    `/api/v1/integrations/naver_search?user_id=${encodeURIComponent(session.user.id)}`,
    { method: "DELETE" }
  )
  const data = await res.json().catch(() => ({}))
  return NextResponse.json(data, { status: res.ok ? 200 : res.status })
}
