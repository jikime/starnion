import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"
import { gatewayFetch } from "@/lib/gateway"

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ use_case: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const { use_case } = await params
  const res = await gatewayFetch(`/api/v1/model-assignments/${encodeURIComponent(use_case)}`, {
    method: "DELETE",
  })
  const data = await res.json().catch(() => ({}))
  return NextResponse.json(data, { status: res.status })
}
