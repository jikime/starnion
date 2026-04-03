import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"
import { gatewayFetch } from "@/lib/gateway"

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ model: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const { model } = await params
  const res = await gatewayFetch(`/api/v1/model-pricing/${encodeURIComponent(model)}`, {
    method: "DELETE",
  })
  const data = await res.json().catch(() => ({}))
  return NextResponse.json(data, { status: res.status })
}
