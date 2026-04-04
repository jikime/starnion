import { NextRequest, NextResponse } from "next/server"
import { GATEWAY_API_URL } from "@/lib/starnion"

export async function POST(req: NextRequest) {
  const body = await req.json()

  const res = await fetch(`${GATEWAY_API_URL}/api/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    return NextResponse.json(
      { error: data.error ?? "Registration failed" },
      { status: res.status }
    )
  }

  return NextResponse.json(data)
}
