import { auth } from "@/auth"
import { NextResponse } from "next/server"

const API_URL = process.env.API_URL ?? "http://localhost:8080"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const res = await fetch(
    `${API_URL}/api/v1/profile/persona?user_id=${encodeURIComponent(session.user.id)}`,
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

  const res = await fetch(
    `${API_URL}/api/v1/profile/persona?user_id=${encodeURIComponent(session.user.id)}`,
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
