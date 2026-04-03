import { Info, AlertTriangle, AlertCircle } from "lucide-react"

export interface LogEntry {
  time: string
  time_ms?: number
  level: string
  message: string
  source?: string
  raw?: string
}

export interface LogResponse {
  entries: LogEntry[]
  total: number
  stats?: { info: number; warn: number; error: number }
  sources?: string[]
  error?: string
}

export const LEVEL_CONFIG = {
  debug: { icon: Info, label: "DBG", dot: "bg-zinc-600", row: "", time: "text-zinc-600", lv: "text-zinc-600", msg: "text-zinc-500" },
  info: { icon: Info, label: "INF", dot: "bg-sky-400", row: "", time: "text-zinc-500", lv: "text-sky-400", msg: "text-zinc-200" },
  warn: { icon: AlertTriangle, label: "WRN", dot: "bg-amber-400", row: "bg-amber-400/[0.04] border-l-2 border-amber-400/60", time: "text-zinc-500", lv: "text-amber-400", msg: "text-amber-200/90" },
  warning: { icon: AlertTriangle, label: "WRN", dot: "bg-amber-400", row: "bg-amber-400/[0.04] border-l-2 border-amber-400/60", time: "text-zinc-500", lv: "text-amber-400", msg: "text-amber-200/90" },
  error: { icon: AlertCircle, label: "ERR", dot: "bg-red-400", row: "bg-red-400/[0.06] border-l-2 border-red-400/70", time: "text-zinc-500", lv: "text-red-400", msg: "text-red-300/90" },
  fatal: { icon: AlertCircle, label: "FTL", dot: "bg-red-500", row: "bg-red-500/[0.08] border-l-2 border-red-500", time: "text-zinc-500", lv: "text-red-400", msg: "text-red-300" },
} as const

export type LevelKey = keyof typeof LEVEL_CONFIG

export const SOURCE_COLOR: Record<string, string> = {
  gateway: "text-sky-400", grpc: "text-sky-400", server: "text-sky-400",
  handler: "text-cyan-400", chat: "text-cyan-400",
  cron: "text-amber-400", scheduler: "text-amber-400",
  agent: "text-emerald-400", db: "text-violet-400", pool: "text-violet-400",
  skills: "text-orange-400", registry: "text-orange-400",
  graph: "text-pink-400", tool: "text-pink-400", __main__: "text-emerald-400",
}

export function ts(iso: string) {
  if (!iso) return "──:──:──"
  try { return new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) }
  catch { return iso }
}

export function fullTs(iso: string) {
  if (!iso) return ""
  try { return new Date(iso).toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }) }
  catch { return iso }
}

export function dateLabel(iso: string) {
  if (!iso) return ""
  try { return new Date(iso).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "short" }) }
  catch { return "" }
}

export function sameDay(a: string, b: string) { return a.slice(0, 10) === b.slice(0, 10) }

export function getCfg(level: string) {
  return LEVEL_CONFIG[(level?.toLowerCase() as LevelKey) ?? "info"] ?? LEVEL_CONFIG.info
}
