/**
 * Server-side starnion config reader for web.
 *
 * Reads ~/.starnion/starnion.yaml at module load time and exposes typed
 * config values for server-side Next.js code (API routes, server components).
 *
 * Priority: existing env vars > starnion.yaml > defaults
 *
 * NEVER import this in client-side code or NEXT_PUBLIC_* contexts.
 */
import fs from "fs"
import os from "os"
import path from "path"

const STARNION_YAML = path.join(os.homedir(), ".starnion", "starnion.yaml")

/** Minimal two-level YAML parser — matches the same format as agent/src/system/config.ts */
function loadStarnionYaml(): Record<string, Record<string, string> | string> {
  if (!fs.existsSync(STARNION_YAML)) return {}

  const config: Record<string, Record<string, string> | string> = {}
  let section: string | null = null

  const lines = fs.readFileSync(STARNION_YAML, "utf-8").split("\n")
  for (const rawLine of lines) {
    const line = rawLine.trimEnd()
    if (!line || line.trimStart().startsWith("#")) continue
    if (!line.includes(":")) continue

    const indent = line.length - line.trimStart().length
    const stripped = line.trimStart()
    const colonIdx = stripped.indexOf(":")
    const key = stripped.slice(0, colonIdx).trim()
    const val = stripped.slice(colonIdx + 1).trim()

    if (indent === 0) {
      if (val) {
        config[key] = val
        section = null
      } else {
        config[key] = {}
        section = key
      }
    } else if (section !== null) {
      (config[section] as Record<string, string>)[key] = val
    }
  }

  return config
}

function sect(
  yaml: Record<string, Record<string, string> | string>,
  key: string,
): Record<string, string> {
  const v = yaml[key]
  return typeof v === "object" ? v : {}
}

const _yaml = loadStarnionYaml()
const _gw = sect(_yaml, "gateway")
const _mn = sect(_yaml, "minio")

/**
 * Gateway base URL for server-side API calls.
 * Env var API_URL takes priority, then starnion.yaml gateway.url.
 */
export const GATEWAY_API_URL =
  process.env.API_URL ?? _gw.url ?? "http://localhost:8080"

/**
 * MinIO credentials for server-side file access.
 * Env vars take priority, then starnion.yaml minio.* values.
 */
export const minioConfig = {
  endpoint: process.env.MINIO_ENDPOINT ?? _mn.endpoint ?? "localhost:9000",
  accessKey: process.env.MINIO_ACCESS_KEY ?? _mn.access_key ?? "",
  secretKey: process.env.MINIO_SECRET_KEY ?? _mn.secret_key ?? "",
  bucket: process.env.MINIO_BUCKET ?? _mn.bucket ?? "starnion-files",
  useSSL: (process.env.MINIO_USE_SSL ?? _mn.use_ssl ?? "false") === "true",
}
