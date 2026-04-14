import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"

import { gatewayFetch } from "@/lib/gateway"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const { searchParams } = req.nextUrl
  const qs = new URLSearchParams()
  const limit = searchParams.get("limit")
  const offset = searchParams.get("offset")
  if (limit) qs.set("limit", limit)
  if (offset) qs.set("offset", offset)
  const suffix = qs.toString() ? `?${qs.toString()}` : ""

  const res = await gatewayFetch(
    `/api/v1/connections/${encodeURIComponent(id)}/activities${suffix}`,
    { cache: "no-store" }
  )
  const data = await res.json().catch(() => ({}))
  return NextResponse.json(data, { status: res.ok ? 200 : res.status })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const res = await gatewayFetch(
    `/api/v1/connections/${encodeURIComponent(id)}/activities`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  )
  const data = await res.json().catch(() => ({}))
  return NextResponse.json(data, { status: res.status })
}
