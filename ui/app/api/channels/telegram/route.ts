import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

import { gatewayFetch } from "@/lib/gateway"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const res = await gatewayFetch(
    `/api/v1/channels/telegram`,
    { cache: "no-store" }
  )

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: "gateway error" }))
    console.error("[channels/telegram] gateway error", res.status, errBody)
    return NextResponse.json(
      { error: errBody.error ?? "gateway error" },
      { status: res.status }
    )
  }

  const data = await res.json()
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 })
  }

  const res = await gatewayFetch(
    `/api/v1/channels/telegram`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  )

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    return NextResponse.json(
      { error: data.error ?? "요청에 실패했어요" },
      { status: res.status }
    )
  }

  return NextResponse.json(data)
}
