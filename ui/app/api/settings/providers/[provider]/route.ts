import { auth } from "@/auth"
import { NextResponse } from "next/server"

const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080"

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const { provider } = await params
  const res = await fetch(
    `${API_URL}/api/v1/providers/${provider}?user_id=${session.user.id}`,
    { method: "DELETE" }
  )
  const data = await res.json().catch(() => ({}))
  return NextResponse.json(data, { status: res.status })
}
