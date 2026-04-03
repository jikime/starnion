import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

import { gatewayFetch } from "@/lib/gateway"

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const { provider } = await params
  const res = await gatewayFetch(
    `/api/v1/providers/${provider}`,
    { method: "DELETE" }
  )
  const data = await res.json().catch(() => ({}))
  return NextResponse.json(data, { status: res.status })
}
