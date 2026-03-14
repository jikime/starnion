import { auth } from "@/lib/auth"
import * as Minio from "minio"
import { NextResponse } from "next/server"

const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT?.split(":")[0] ?? "localhost",
  port: parseInt(process.env.MINIO_ENDPOINT?.split(":")[1] ?? "9000"),
  useSSL: process.env.MINIO_USE_SSL === "true",
  accessKey: process.env.MINIO_ACCESS_KEY ?? "",
  secretKey: process.env.MINIO_SECRET_KEY ?? "",
})

const BUCKET = process.env.MINIO_BUCKET ?? "starnion-files"

/**
 * GET /api/v1/files/[...key]
 *
 * Authenticated file proxy for MinIO objects.
 * Verifies the NextAuth session, generates a short-lived presigned URL
 * directly from MinIO, then redirects the browser to it.
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

  try {
    const url = await minioClient.presignedGetObject(BUCKET, objectKey, 60)
    return NextResponse.redirect(url)
  } catch {
    return NextResponse.json({ error: "file not found" }, { status: 404 })
  }
}
