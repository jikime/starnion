import { auth } from "@/auth"
import { SignJWT } from "jose"
import { NextResponse } from "next/server"

import { gatewayFetch } from "@/lib/gateway"
const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? "change-me-in-production")

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const code: string = body?.code ?? ""
  if (!code.trim()) {
    return NextResponse.json({ error: "code is required" }, { status: 400 })
  }

  // Sign a short-lived JWT so the Gateway can identify the calling web user.
  const token = await new SignJWT({ plat: "web" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.user.id)
    .setExpirationTime("5m")
    .sign(secret)

  const res = await gatewayFetch(`/auth/link`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ code: code.trim() }),
  })

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    return NextResponse.json(
      { error: data.error ?? "계정 연결에 실패했어요" },
      { status: res.status }
    )
  }

  return NextResponse.json({ userId: data.userId })
}
