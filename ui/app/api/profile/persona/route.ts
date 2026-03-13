import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

import { gatewayFetch } from "@/lib/gateway"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const res = await gatewayFetch(
    `/api/v1/profile/persona`,
    { cache: "no-store" }
  )
  const data = await res.json().catch(() => ({ persona: "assistant" }))
  return NextResponse.json(data)
}

export async function PATCH(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body?.persona) {
    return NextResponse.json({ error: "persona is required" }, { status: 400 })
  }

  const res = await gatewayFetch(
    `/api/v1/profile/persona`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ persona: body.persona }),
    }
  )
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    return NextResponse.json({ error: "update failed" }, { status: res.status })
  }
  return NextResponse.json(data)
}
