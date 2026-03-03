import { auth } from "@/auth"
import { NextResponse } from "next/server"

const API_URL = process.env.API_URL ?? "http://localhost:8080"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const { id } = await params

  const url = new URL(request.url)
  const before = url.searchParams.get("before") ?? ""
  const limit = url.searchParams.get("limit") ?? "30"

  const upstream = new URL(`${API_URL}/api/v1/conversations/${id}/messages`)
  if (before) upstream.searchParams.set("before", before)
  upstream.searchParams.set("limit", limit)

  const res = await fetch(upstream.toString(), { cache: "no-store" })
  const data = await res.json().catch(() => ({ messages: [], has_more: false, next_cursor: null }))
  if (!res.ok) {
    return NextResponse.json({ error: "history unavailable" }, { status: res.status })
  }
  return NextResponse.json(data)
}
