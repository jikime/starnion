import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

import { gatewayFetch } from "@/lib/gateway"

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const { id } = await params

  const res = await gatewayFetch(
    `/api/v1/channels/telegram/pairing/${encodeURIComponent(id)}/approve?user_id=${encodeURIComponent(session.user.id)}`,
    { method: "POST" }
  )

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    return NextResponse.json({ error: data.error ?? "승인 실패" }, { status: res.status })
  }
  return NextResponse.json(data)
}
