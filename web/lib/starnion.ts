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
import yaml from "js-yaml"

const STARNION_YAML = path.join(os.homedir(), ".starnion", "starnion.yaml")

/**
 * Parse ~/.starnion/starnion.yaml via js-yaml. Previously this file had
 * a hand-rolled two-level parser that silently corrupted quoted values
 * and multi-line strings — the agent side had the same bug and now also
 * uses js-yaml for the same reason.
 */
function loadStarnionYaml(): Record<string, Record<string, string> | string> {
  if (!fs.existsSync(STARNION_YAML)) return {}

  try {
    const raw = fs.readFileSync(STARNION_YAML, "utf-8")
    const parsed = yaml.load(raw)
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const out: Record<string, Record<string, string> | string> = {}
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (v == null) continue
        if (typeof v === "object" && !Array.isArray(v)) {
          const sub: Record<string, string> = {}
          for (const [sk, sv] of Object.entries(v as Record<string, unknown>)) {
            if (sv == null) continue
            sub[sk] = typeof sv === "string" ? sv : String(sv)
          }
          out[k] = sub
        } else if (typeof v === "string") {
          out[k] = v
        } else {
          out[k] = String(v)
        }
      }
      return out
    }
  } catch (err) {
    console.warn("[starnion.ts] failed to parse starnion.yaml:", (err as Error).message)
  }
  return {}
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
