import { auth } from "@/auth"
import { NextRequest, NextResponse } from "next/server"

const API_URL = process.env.API_URL ?? "http://localhost:8080"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const qs = new URLSearchParams({ user_id: session.user.id })
  for (const [k, v] of searchParams.entries()) {
    if (k !== "user_id") qs.set(k, v)
  }

  const res = await fetch(`${API_URL}/api/v1/audios?${qs}`, { cache: "no-store" })
  const data = await res.json().catch(() => [])
  return NextResponse.json(data, { status: res.ok ? 200 : res.status })
}
