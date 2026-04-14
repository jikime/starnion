import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

import { gatewayFetch } from "@/lib/gateway"

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; activityId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const { id, activityId } = await params
  const res = await gatewayFetch(
    `/api/v1/connections/${encodeURIComponent(id)}/activities/${encodeURIComponent(activityId)}`,
    { method: "DELETE" }
  )
  if (res.status === 204 || res.ok) {
    return new NextResponse(null, { status: 204 })
  }
  const body = await res.json().catch(() => ({}))
  return NextResponse.json(body, { status: res.status })
}
