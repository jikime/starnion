import { auth } from "@/auth"
import { NextRequest, NextResponse } from "next/server"

const API_URL = process.env.API_URL ?? "http://localhost:8080"

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const qs = new URLSearchParams({ user_id: session.user.id })
  const res = await fetch(`${API_URL}/api/v1/images/${id}?${qs}`, {
    method: "DELETE",
  })
  const data = await res.json().catch(() => ({}))
  return NextResponse.json(data, { status: res.ok ? 200 : res.status })
}
