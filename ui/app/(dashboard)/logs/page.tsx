"use client"

import { useEffect, useState, useCallback, useRef, useMemo } from "react"
import { useTranslations } from "next-intl"
import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  Bot,
  Info,
  RefreshCw,
  ScrollText,
  Search,
  Server,
  Terminal,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

// ─── Types ────────────────────────────────────────────────────────────────────

interface LogEntry {
  time: string
  time_ms?: number
  level: string
  message: string
  source?: string
  raw: string
}

interface LogResponse {
  entries: LogEntry[]
  total: number
  stats?: { info: number; warn: number; error: number }
  sources?: string[]
  error?: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const LEVEL_CONFIG = {
  debug: {
    icon: Info,
    label: "DBG",
    dot: "bg-zinc-600",
    row: "",
    time: "text-zinc-600",
    lv: "text-zinc-600",
    msg: "text-zinc-500",
  },
  info: {
    icon: Info,
    label: "INF",
    dot: "bg-sky-400",
    row: "",
    time: "text-zinc-500",
    lv: "text-sky-400",
    msg: "text-zinc-200",
  },
  warn: {
    icon: AlertTriangle,
    label: "WRN",
    dot: "bg-amber-400",
    row: "bg-amber-400/[0.04] border-l-2 border-amber-400/60",
    time: "text-zinc-500",
    lv: "text-amber-400",
    msg: "text-amber-200/90",
  },
  warning: {
    icon: AlertTriangle,
    label: "WRN",
    dot: "bg-amber-400",
    row: "bg-amber-400/[0.04] border-l-2 border-amber-400/60",
    time: "text-zinc-500",
    lv: "text-amber-400",
    msg: "text-amber-200/90",
  },
  error: {
    icon: AlertCircle,
    label: "ERR",
    dot: "bg-red-400",
    row: "bg-red-400/[0.06] border-l-2 border-red-400/70",
    time: "text-zinc-500",
    lv: "text-red-400",
    msg: "text-red-300/90",
  },
  fatal: {
    icon: AlertCircle,
    label: "FTL",
    dot: "bg-red-500",
    row: "bg-red-500/[0.08] border-l-2 border-red-500",
    time: "text-zinc-500",
    lv: "text-red-400",
    msg: "text-red-300",
  },
} as const

type LevelKey = keyof typeof LEVEL_CONFIG

const SOURCE_COLOR: Record<string, string> = {
  grpc: "text-sky-400",
  server: "text-sky-400",
  handler: "text-cyan-400",
  chat: "text-cyan-400",
  cron: "text-amber-400",
  scheduler: "text-amber-400",
  agent: "text-emerald-400",
  db: "text-violet-400",
  pool: "text-violet-400",
  skills: "text-orange-400",
  registry: "text-orange-400",
  graph: "text-pink-400",
  tool: "text-pink-400",
  __main__: "text-emerald-400",
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ts(iso: string) {
  if (!iso) return "──:──:──"
  try {
    return new Date(iso).toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
  } catch {
    return iso
  }
}

function dateLabel(iso: string) {
  if (!iso) return ""
  try {
    return new Date(iso).toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "short",
    })
  } catch {
    return ""
  }
}

function sameDay(a: string, b: string) {
  return a.slice(0, 10) === b.slice(0, 10)
}

function Highlight({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>
  const i = text.toLowerCase().indexOf(q.toLowerCase())
  if (i === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, i)}
      <span className="rounded-sm bg-amber-400/30 text-amber-200 ring-1 ring-amber-400/40">
        {text.slice(i, i + q.length)}
      </span>
      {text.slice(i + q.length)}
    </>
  )
}

// Tool name → badge color
const TOOL_BADGE_COLOR: Record<string, string> = {
  web_search: "bg-pink-500/20 text-pink-300 ring-pink-500/30",
  web_fetch: "bg-fuchsia-500/20 text-fuchsia-300 ring-fuchsia-500/30",
  get_weather: "bg-sky-500/20 text-sky-300 ring-sky-500/30",
}
const TOOL_DEFAULT_COLOR = "bg-violet-500/20 text-violet-300 ring-violet-500/30"
const TOOL_CALL_RE = /^(tool_call:\s*)(\S+)(.*)/s

function MessageContent({ text, q }: { text: string; q: string }) {
  const m = TOOL_CALL_RE.exec(text)
  if (!m) return <Highlight text={text} q={q} />
  const [, prefix, toolName, rest] = m
  const color = TOOL_BADGE_COLOR[toolName] ?? TOOL_DEFAULT_COLOR
  return (
    <>
      <span className="text-zinc-500">{prefix}</span>
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded px-1.5 py-px font-mono text-[10px] ring-1",
          color
        )}
      >
        ⚙ {toolName}
      </span>
      {rest && <Highlight text={rest} q={q} />}
    </>
  )
}

// ─── Log Panel ────────────────────────────────────────────────────────────────

function LogPanel({
  apiPath,
  streamPath,
  useSSE,
}: {
  apiPath: string
  streamPath?: string
  useSSE: boolean
}) {
  const t = useTranslations("logs")
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [sources, setSources] = useState<string[]>([])
  const [stats, setStats] = useState({ info: 0, warn: 0, error: 0 })
  const [loading, setLoading] = useState(true)
  const [live, setLive] = useState(true)
  const [search, setSearch] = useState("")
  const [srcFilter, setSrcFilter] = useState("all")
  const [lvFilter, setLvFilter] = useState("")
  const [limit, setLimit] = useState("200")
  const [autoScroll, setAutoScroll] = useState(true)
  const [svcError, setSvcError] = useState<string | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const esRef = useRef<EventSource | null>(null)

  const buildQS = useCallback(() => {
    const p = new URLSearchParams({ limit })
    if (search) p.set("search", search)
    if (srcFilter !== "all") p.set("source", srcFilter)
    if (lvFilter) p.set("level", lvFilter)
    return p.toString()
  }, [limit, search, srcFilter, lvFilter])

  const fetchLogs = useCallback(async () => {
    try {
      const r = await fetch(`${apiPath}?${buildQS()}`)
      const d: LogResponse = await r.json()
      if (d.error) {
        setSvcError(d.error)
      } else {
        setSvcError(null)
        setEntries(d.entries ?? [])
        if (d.stats) setStats(d.stats)
        if (d.sources) setSources(d.sources)
      }
    } catch {
      setSvcError(t("connectionFailed"))
    } finally {
      setLoading(false)
    }
  }, [apiPath, buildQS])

  const stopLive = useCallback(() => {
    esRef.current?.close()
    esRef.current = null
    clearInterval(timerRef.current ?? undefined)
    timerRef.current = null
  }, [])

  useEffect(() => {
    void fetchLogs()
    stopLive()

    if (!live) return

    if (useSSE && streamPath) {
      const es = new EventSource(streamPath)
      esRef.current = es
      es.onmessage = (e) => {
        try {
          const entry: LogEntry = JSON.parse(e.data)
          setEntries((p) => {
            const n = [...p, entry]
            return n.length > 2000 ? n.slice(-2000) : n
          })
        } catch {}
      }
    } else {
      timerRef.current = setInterval(() => {
        if (document.visibilityState === "visible") void fetchLogs()
      }, 3000)
    }

    return stopLive
  }, [live, useSSE, streamPath, fetchLogs, stopLive]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (autoScroll && scrollRef.current)
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [entries, autoScroll])

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 60)
  }, [])

  const hasFilter = !!(search || srcFilter !== "all" || lvFilter)

  const rows = useMemo(() => [...entries].reverse(), [entries])

  const cfg = (level: string) =>
    LEVEL_CONFIG[(level?.toLowerCase() as LevelKey) ?? "info"] ?? LEVEL_CONFIG.info

  return (
    <div className="flex h-full flex-col gap-3">
      {/* ── Controls bar ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Live toggle */}
        <TooltipProvider delayDuration={400}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setLive((v) => !v)}
                className={cn(
                  "h-8 gap-2 font-mono text-sm transition-all",
                  live
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300"
                    : "text-muted-foreground"
                )}
              >
                <span className="relative flex size-2 shrink-0">
                  {live && (
                    <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/60" />
                  )}
                  <span
                    className={cn(
                      "relative size-2 rounded-full",
                      live ? "bg-emerald-400" : "bg-muted-foreground/40"
                    )}
                  />
                </span>
                {live ? "LIVE" : "PAUSED"}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {live ? t("pause") : t("resume")}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void fetchLogs()}
                disabled={loading}
                className="size-8 p-0 text-muted-foreground hover:text-foreground"
              >
                <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t("refresh")}</TooltipContent>
          </Tooltip>

          <Separator orientation="vertical" className="mx-0.5 h-5" />

          {/* Search */}
          <div className="relative min-w-[180px] flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/60" />
            <Input
              className="h-8 border-border/50 bg-background pl-8 pr-7 font-mono text-sm placeholder:text-muted-foreground/40 focus-visible:ring-1"
              placeholder="/ search logs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            )}
          </div>

          {/* Level filter */}
          <ToggleGroup
            type="single"
            value={lvFilter}
            onValueChange={(v) => setLvFilter(v)}
            variant="outline"
            size="sm"
            className="h-8 font-mono"
          >
            <ToggleGroupItem
              value="info"
              className="px-2.5 text-xs tracking-wider data-[state=on]:border-sky-500/50 data-[state=on]:bg-sky-500/10 data-[state=on]:text-sky-400"
            >
              INF
            </ToggleGroupItem>
            <ToggleGroupItem
              value="warn"
              className="px-2.5 text-xs tracking-wider data-[state=on]:border-amber-500/50 data-[state=on]:bg-amber-500/10 data-[state=on]:text-amber-400"
            >
              WRN
            </ToggleGroupItem>
            <ToggleGroupItem
              value="error"
              className="px-2.5 text-xs tracking-wider data-[state=on]:border-red-500/50 data-[state=on]:bg-red-500/10 data-[state=on]:text-red-400"
            >
              ERR
            </ToggleGroupItem>
          </ToggleGroup>

          {/* Source */}
          {sources.length > 0 && (
            <Select value={srcFilter} onValueChange={setSrcFilter}>
              <SelectTrigger className="h-8 w-[130px] border-border/50 font-mono text-sm">
                <SelectValue placeholder="all sources" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="font-mono text-sm">
                  all sources
                </SelectItem>
                {sources.map((s) => (
                  <SelectItem key={s} value={s} className="font-mono text-sm">
                    [{s}]
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Limit */}
          <Select value={limit} onValueChange={setLimit}>
            <SelectTrigger className="h-8 w-[100px] border-border/50 font-mono text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["100", "200", "500", "1000", "2000"].map((n) => (
                <SelectItem key={n} value={n} className="font-mono text-sm">
                  {n} lines
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Stats */}
          <div className="ml-auto flex items-center gap-3 font-mono text-xs">
            <span className="text-muted-foreground/50">
              <span className="text-sky-400">{stats.info}</span> inf
            </span>
            {stats.warn > 0 && (
              <span className="text-muted-foreground/50">
                <span className="text-amber-400">{stats.warn}</span> wrn
              </span>
            )}
            {stats.error > 0 && (
              <span className="text-muted-foreground/50">
                <span className="text-red-400">{stats.error}</span> err
              </span>
            )}
          </div>
        </TooltipProvider>
      </div>

      {/* ── Terminal window ───────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-white/[0.07] bg-zinc-950 ring-1 ring-inset ring-white/[0.04]">
        {/* Log content */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="min-h-0 flex-1 overflow-y-auto
            [&::-webkit-scrollbar]:w-1
            [&::-webkit-scrollbar-track]:bg-transparent
            [&::-webkit-scrollbar-thumb]:rounded-full
            [&::-webkit-scrollbar-thumb]:bg-white/[0.08]
            [&::-webkit-scrollbar-thumb:hover]:bg-white/[0.15]"
        >
          {svcError ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
              <div className="rounded-full border border-red-400/20 bg-red-400/10 p-4">
                <AlertCircle className="size-6 text-red-400" />
              </div>
              <div className="text-center">
                <p className="font-mono text-base text-red-400">{svcError}</p>
                <p className="mt-1 font-mono text-sm text-zinc-600">
                  {t("checkServer")}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void fetchLogs()}
                className="mt-2 border-white/10 bg-white/5 font-mono text-sm text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
              >
                <RefreshCw className="mr-2 size-3" />
                {t("retry")}
              </Button>
            </div>
          ) : loading && rows.length === 0 ? (
            <div className="flex h-32 items-center justify-center gap-1.5">
              <span className="size-1.5 animate-bounce rounded-full bg-zinc-600 [animation-delay:0ms]" />
              <span className="size-1.5 animate-bounce rounded-full bg-zinc-600 [animation-delay:150ms]" />
              <span className="size-1.5 animate-bounce rounded-full bg-zinc-600 [animation-delay:300ms]" />
            </div>
          ) : rows.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center gap-3">
              <Terminal className="size-8 text-zinc-700" />
              <p className="font-mono text-base text-zinc-600">no logs found</p>
            </div>
          ) : (
            <div className="pb-2">
              {rows.map((entry, i) => {
                const level = entry.level?.toLowerCase() ?? "info"
                const c = cfg(level)
                const Icon = c.icon
                const src = entry.source ?? "app"
                const msg = entry.message || entry.raw
                const prev = rows[i - 1]
                const showDay =
                  i === 0 ||
                  (entry.time && prev?.time && !sameDay(entry.time, prev.time))

                return (
                  <div key={entry.time_ms ? `${entry.time_ms}-${i}` : i}>
                    {showDay && entry.time && (
                      <div className="my-3 flex items-center gap-3 px-4">
                        <div className="h-px flex-1 bg-white/[0.05]" />
                        <span className="font-mono text-[11px] text-zinc-600">
                          {dateLabel(entry.time)}
                        </span>
                        <div className="h-px flex-1 bg-white/[0.05]" />
                      </div>
                    )}
                    <div
                      className={cn(
                        "group flex items-start gap-0 transition-colors hover:bg-white/[0.025]",
                        c.row
                      )}
                    >
                      {/* Timestamp */}
                      <span
                        className={cn(
                          "w-24 shrink-0 select-none px-4 py-0.5 font-mono text-xs tabular-nums",
                          c.time
                        )}
                      >
                        {ts(entry.time)}
                      </span>

                      {/* Level */}
                      <span
                        className={cn(
                          "w-10 shrink-0 py-0.5 font-mono text-xs font-semibold tracking-wider",
                          c.lv
                        )}
                      >
                        {c.label}
                      </span>

                      {/* Source */}
                      <span
                        className={cn(
                          "w-24 shrink-0 truncate py-0.5 pr-2 font-mono text-xs font-medium",
                          SOURCE_COLOR[src] ?? "text-zinc-400"
                        )}
                      >
                        {src}
                      </span>

                      {/* Message */}
                      <span
                        className={cn(
                          "flex-1 break-all py-0.5 pr-4 font-mono text-xs leading-relaxed whitespace-pre-wrap",
                          c.msg
                        )}
                      >
                        <MessageContent text={msg} q={search} />
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Status bar */}
        <div className="flex shrink-0 items-center justify-between border-t border-white/[0.05] bg-zinc-900/40 px-4 py-1.5">
          <span className="font-mono text-xs text-zinc-600">
            {rows.length.toLocaleString()} lines
            {hasFilter && (
              <span className="ml-1 text-amber-400/60">(filtered)</span>
            )}
          </span>
          <div className="flex items-center gap-3">
            {!autoScroll && (
              <button
                onClick={() => {
                  setAutoScroll(true)
                  if (scrollRef.current)
                    scrollRef.current.scrollTop = scrollRef.current.scrollHeight
                }}
                className="flex items-center gap-1 font-mono text-xs text-zinc-500 transition-colors hover:text-zinc-300"
              >
                <ArrowDown className="size-3" />
                scroll to bottom
              </button>
            )}
            {live && (
              <span className="flex items-center gap-1.5 font-mono text-xs text-emerald-500/70">
                <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />
                {useSSE ? "sse" : "poll/3s"}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type ServerTab = "gateway" | "agent"

const SERVERS: { id: ServerTab; label: string; icon: React.ComponentType<{ className?: string }> }[] =
  [
    { id: "gateway", label: "Gateway", icon: Server },
    { id: "agent", label: "Agent", icon: Bot },
  ]

export default function LogsPage() {
  const tl = useTranslations("logs")
  const [tab, setTab] = useState<ServerTab>("gateway")

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col gap-0">
      {/* ── Page header ── */}
      <div className="flex shrink-0 items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-lg border bg-muted/50">
            <Terminal className="size-4 text-muted-foreground" />
          </div>
          <div>
            <h1 className="flex items-center gap-2 text-base font-semibold">
              <ScrollText className="size-5 text-primary" />
              Logs
            </h1>
            <p className="text-sm text-muted-foreground">
              {tl("subtitle")}
            </p>
          </div>
        </div>

        {/* Server switcher */}
        <div className="flex items-center rounded-lg border bg-muted/30 p-1 gap-0.5">
          {SERVERS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all",
                tab === id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex min-h-0 flex-1 flex-col p-5">
        {tab === "gateway" ? (
          <LogPanel
            key="gateway"
            apiPath="/api/logs/gateway"
            streamPath="/api/logs/gateway/stream"
            useSSE
          />
        ) : (
          <LogPanel key="agent" apiPath="/api/logs/agent" useSSE={false} />
        )}
      </div>
    </div>
  )
}
