import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

import { gatewayFetch } from "@/lib/gateway"

/**
 * GET /api/files/[...key]
 *
 * Authenticated file proxy for MinIO objects.
 * Verifies the NextAuth session, requests a short-lived presigned URL
 * from the gateway, then redirects the browser directly to MinIO.
 * MinIO handles the actual file transfer — this route is not in the data path.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string[] }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const { key } = await params
  const objectKey = key.join("/")

  const res = await gatewayFetch(`/api/v1/files/${objectKey}`)
  if (!res.ok) {
    return NextResponse.json({ error: "file not found" }, { status: res.status })
  }

  const data = await res.json().catch(() => null)
  if (!data?.url) {
    return NextResponse.json({ error: "invalid response from storage" }, { status: 502 })
  }

  return NextResponse.redirect(data.url)
}
