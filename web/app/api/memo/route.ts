import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"

import { gatewayFetch } from "@/lib/gateway"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const { searchParams } = req.nextUrl
  const qs = new URLSearchParams()
  for (const key of ["tag", "q", "limit", "page"]) {
    const v = searchParams.get(key)
    if (v) qs.set(key, v)
  }

  const res = await gatewayFetch(`/api/v1/memos?${qs}`, { cache: "no-store" })
  const data = await res.json().catch(() => ({}))
  const raw: Array<{ id: number; title: string; content: string; tag?: string }> =
    Array.isArray(data) ? data : (data?.memos ?? [])
  // Gateway stores tag as a single string; dashboard expects tags array
  const memos = raw.map(({ tag, ...rest }) => ({
    ...rest,
    tags: tag ? tag.split(",").map((t: string) => t.trim()).filter(Boolean) : [],
  }))
  return NextResponse.json(memos, { status: res.ok ? 200 : res.status })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const res = await gatewayFetch(`/api/v1/memos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  return NextResponse.json(data, { status: res.ok ? 201 : res.status })
}
