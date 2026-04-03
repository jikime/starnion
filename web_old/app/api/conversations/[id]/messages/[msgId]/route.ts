import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"
import { gatewayFetch } from "@/lib/gateway"

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; msgId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const { id, msgId } = await params

  const res = await gatewayFetch(`/api/v1/conversations/${id}/messages/${msgId}`, {
    method: "DELETE",
  })
  if (!res.ok) {
    return NextResponse.json({ error: "delete failed" }, { status: res.status })
  }
  return NextResponse.json({ status: "deleted" })
}
