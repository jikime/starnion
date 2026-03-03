import { auth } from "@/auth"
import { NextResponse } from "next/server"

const API_URL = process.env.API_URL ?? "http://localhost:8080"

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
  if (!body?.title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 })
  }

  const res = await fetch(`${API_URL}/api/v1/conversations/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: session.user.id, title: body.title }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    return NextResponse.json({ error: "update failed" }, { status: res.status })
  }
  return NextResponse.json(data)
}
