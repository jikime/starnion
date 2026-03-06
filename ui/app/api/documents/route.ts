import { auth } from "@/auth"
import { NextRequest, NextResponse } from "next/server"

const API_URL = process.env.API_URL ?? "http://localhost:8080"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const qs = new URLSearchParams({ user_id: session.user.id })
  const res = await fetch(`${API_URL}/api/v1/documents?${qs}`, { cache: "no-store" })
  const data = await res.json().catch(() => [])
  return NextResponse.json(data, { status: res.ok ? 200 : res.status })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  // Forward multipart form as-is, injecting user_id.
  const formData = await req.formData()
  formData.set("user_id", session.user.id)

  const res = await fetch(`${API_URL}/api/v1/documents`, {
    method: "POST",
    body: formData,
  })
  const data = await res.json().catch(() => ({}))
  return NextResponse.json(data, { status: res.ok ? 201 : res.status })
}
