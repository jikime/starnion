import { auth } from "@/auth"
import { NextResponse } from "next/server"

const API_URL = process.env.API_URL ?? "http://localhost:8080"

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const formData = await request.formData().catch(() => null)
  if (!formData || !formData.get("file")) {
    return NextResponse.json({ error: "file is required" }, { status: 400 })
  }

  // Proxy multipart upload to Go gateway.
  const res = await fetch(`${API_URL}/api/v1/upload`, {
    method: "POST",
    body: formData,
  }).catch(() => null)

  if (!res || !res.ok) {
    const text = await res?.text().catch(() => "")
    return NextResponse.json({ error: text || "upload failed" }, { status: 502 })
  }

  const data = await res.json().catch(() => null)
  if (!data) {
    return NextResponse.json({ error: "invalid response from storage" }, { status: 502 })
  }

  return NextResponse.json(data)
}
