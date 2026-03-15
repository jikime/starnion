import { auth } from "@/lib/auth"
import * as Minio from "minio"

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
 * Next.js fetches the object from MinIO (internal network) and streams
 * it directly to the browser — MinIO never needs to be publicly exposed.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string[] }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })
  }

  const { key } = await params
  const objectKey = key.join("/")

  try {
    const stat = await minioClient.statObject(BUCKET, objectKey)
    const stream = await minioClient.getObject(BUCKET, objectKey)

    const body = new ReadableStream({
      start(controller) {
        stream.on("data", (chunk) => controller.enqueue(chunk))
        stream.on("end", () => controller.close())
        stream.on("error", (err) => controller.error(err))
      },
    })

    return new Response(body, {
      headers: {
        "Content-Type": stat.metaData?.["content-type"] ?? "application/octet-stream",
        "Content-Length": String(stat.size),
        "Cache-Control": "private, max-age=3600",
      },
    })
  } catch {
    return new Response(JSON.stringify({ error: "file not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    })
  }
}
