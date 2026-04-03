"use client"

import { useEffect, useState, useCallback, useRef, useMemo } from "react"
import { useTranslations } from "next-intl"
import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  Check,
  ClipboardCopy,
  Download,
  Info,
  RefreshCw,
  ScrollText,
  Search,
  Terminal,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"

// ─── Types ────────────────────────────────────────────────────────────────────

interface LogEntry {
  time: string
  time_ms?: number
  level: string
  message: string
  source?: string
  raw?: string
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
  gateway: "text-sky-400",
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

function fullTs(iso: string) {
  if (!iso) return ""
  try {
    return new Date(iso).toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
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

// ─── #3 Debounce Hook ─────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

// ─── #1 Log Detail Dialog ─────────────────────────────────────────────────────

function LogDetailDialog({
  entry,
  open,
  onOpenChange,
}: {
  entry: LogEntry | null
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const t = useTranslations("logs")
  const [copied, setCopied] = useState(false)

  if (!entry) return null

  const level = entry.level?.toLowerCase() ?? "info"
  const cfg = LEVEL_CONFIG[(level as LevelKey)] ?? LEVEL_CONFIG.info
  const msg = entry.message || entry.raw || ""
  const src = entry.source ?? "app"

  const handleCopy = async () => {
    const text = [
      `[${fullTs(entry.time)}] [${cfg.label}] [${src}]`,
      msg,
    ].join("\n")
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-zinc-950 border-white/10 text-zinc-100">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-mono text-sm">
            <span className={cn("text-xs font-bold tracking-wider", cfg.lv)}>
              {cfg.label}
            </span>
            <span className={cn("text-xs", SOURCE_COLOR[src] ?? "text-zinc-400")}>
              [{src}]
            </span>
            <span className="ml-auto text-xs text-zinc-500 font-normal">
              {fullTs(entry.time)}
            </span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className={cn(
            "rounded-lg border p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all",
            level === "error" || level === "fatal"
              ? "border-red-400/20 bg-red-950/20 text-red-300"
              : level === "warn" || level === "warning"
                ? "border-amber-400/20 bg-amber-950/20 text-amber-200"
                : "border-white/[0.07] bg-zinc-900 text-zinc-200"
          )}>
            {msg}
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="outline"
              onClick={handleCopy}
              className="border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200 font-mono text-xs"
            >
              {copied
                ? <><Check className="size-3 mr-1.5 text-emerald-400" />{t("copied")}</>
                : <><ClipboardCopy className="size-3 mr-1.5" />{t("copyText")}</>}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
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
  const [totalCount, setTotalCount] = useState(0)
  const [stats, setStats] = useState({ info: 0, warn: 0, error: 0 })
  const [loading, setLoading] = useState(true)
  const [live, setLive] = useState(true)
  // #3 분리된 입력 state + debounced
  const [searchInput, setSearchInput] = useState("")
  const search = useDebounce(searchInput, 300)
  const [srcFilter, setSrcFilter] = useState("all")
  // #2 복수 레벨 필터
  const [lvFilter, setLvFilter] = useState<string[]>([])
  const [limit, setLimit] = useState("200")
  const [autoScroll, setAutoScroll] = useState(true)
  const [svcError, setSvcError] = useState<string | null>(null)
  // #1 로그 상세 다이얼로그
  const [detailEntry, setDetailEntry] = useState<LogEntry | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  // #8 전체 복사
  const [allCopied, setAllCopied] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const esRef = useRef<EventSource | null>(null)
  // #5 필터 변경 시 LIVE 일시정지 감지
  const isFirstRender = useRef(true)

  const buildQS = useCallback(() => {
    const p = new URLSearchParams({ limit })
    if (search) p.set("search", search)
    if (srcFilter !== "all") p.set("source", srcFilter)
    if (lvFilter.length > 0) p.set("level", lvFilter.join(","))
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
        setTotalCount(d.total ?? d.entries?.length ?? 0)
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

  // #5 필터 변경 시 LIVE 자동 일시정지
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    if (live) {
      setLive(false)
      toast.info(t("filterChanged"), {
        description: t("filterChangedDesc"),
        duration: 3000,
      })
    }
  }, [search, srcFilter, lvFilter]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const hasFilter = !!(searchInput || srcFilter !== "all" || lvFilter.length > 0)

  const rows = useMemo(() => [...entries].reverse(), [entries])

  const cfg = (level: string) =>
    LEVEL_CONFIG[(level?.toLowerCase() as LevelKey) ?? "info"] ?? LEVEL_CONFIG.info

  // #1 로그 행 클릭
  const handleRowClick = (entry: LogEntry) => {
    setDetailEntry(entry)
    setDetailOpen(true)
  }

  // #4 stats 클릭 → 레벨 필터 토글
  const toggleStatFilter = (level: string) => {
    setLvFilter((prev) =>
      prev.includes(level) ? prev.filter((l) => l !== level) : [...prev, level]
    )
  }

  // #8 전체 로그 복사
  const handleCopyAll = async () => {
    const text = rows
      .map((e) => {
        const c = cfg(e.level)
        const msg = e.message || e.raw || ""
        return `[${fullTs(e.time)}] [${c.label}] [${e.source ?? "app"}] ${msg}`
      })
      .join("\n")
    await navigator.clipboard.writeText(text)
    setAllCopied(true)
    toast.success(t("copySuccess", { count: rows.length }))
    setTimeout(() => setAllCopied(false), 2000)
  }

  // #8 전체 로그 다운로드
  const handleDownload = () => {
    const text = rows
      .map((e) => {
        const c = cfg(e.level)
        const msg = e.message || e.raw || ""
        return `[${fullTs(e.time)}] [${c.label}] [${e.source ?? "app"}] ${msg}`
      })
      .join("\n")
    const blob = new Blob([text], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `logs_${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.txt`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(t("downloadSuccess"))
  }

  return (
    <div className="flex h-full flex-col gap-3">
      {/* ── Controls bar ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
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

          {/* Search — #3 input/debounced 분리 */}
          <div className="relative min-w-[180px] flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/60" />
            <Input
              className="h-8 border-border/50 bg-background pl-8 pr-7 font-mono text-sm placeholder:text-muted-foreground/40 focus-visible:ring-1"
              placeholder="/ search logs..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            {searchInput && (
              <button
                onClick={() => setSearchInput("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            )}
          </div>

          {/* #2 복수 레벨 필터 */}
          <ToggleGroup
            type="multiple"
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

          {/* Source — #10 항상 공간 유지 */}
          <div className="w-[130px]">
            {sources.length > 0 ? (
              <Select value={srcFilter} onValueChange={setSrcFilter}>
                <SelectTrigger className="h-8 w-full border-border/50 font-mono text-sm">
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
            ) : (
              <div className="h-8 w-full rounded-md border border-border/50 bg-background px-3 flex items-center">
                <span className="font-mono text-sm text-muted-foreground/40">all sources</span>
              </div>
            )}
          </div>

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

          {/* #4 Stats — 클릭으로 필터링, #6 항상 표시 */}
          <div className="ml-auto flex items-center gap-3 font-mono text-xs">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => toggleStatFilter("info")}
                  className={cn(
                    "transition-opacity hover:opacity-100",
                    lvFilter.includes("info") ? "opacity-100" : "opacity-60 hover:opacity-80"
                  )}
                >
                  <span className="text-sky-400">{stats.info}</span>
                  <span className="text-muted-foreground/50"> inf</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="font-mono text-xs">{t("infToggle")}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => toggleStatFilter("warn")}
                  className={cn(
                    "transition-opacity hover:opacity-100",
                    lvFilter.includes("warn") ? "opacity-100" : "opacity-60 hover:opacity-80"
                  )}
                >
                  <span className={stats.warn > 0 ? "text-amber-400" : "text-zinc-600"}>{stats.warn}</span>
                  <span className="text-muted-foreground/50"> wrn</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="font-mono text-xs">{t("wrnToggle")}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => toggleStatFilter("error")}
                  className={cn(
                    "transition-opacity hover:opacity-100",
                    lvFilter.includes("error") ? "opacity-100" : "opacity-60 hover:opacity-80"
                  )}
                >
                  <span className={stats.error > 0 ? "text-red-400" : "text-zinc-600"}>{stats.error}</span>
                  <span className="text-muted-foreground/50"> err</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="font-mono text-xs">{t("errToggle")}</TooltipContent>
            </Tooltip>

            <Separator orientation="vertical" className="h-4 mx-0.5" />

            {/* #8 전체 복사/다운로드 */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleCopyAll}
                  disabled={rows.length === 0}
                  className="text-muted-foreground/50 hover:text-zinc-300 transition-colors disabled:opacity-30"
                >
                  {allCopied
                    ? <Check className="size-3.5 text-emerald-400" />
                    : <ClipboardCopy className="size-3.5" />}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="font-mono text-xs">{t("copyAll")}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleDownload}
                  disabled={rows.length === 0}
                  className="text-muted-foreground/50 hover:text-zinc-300 transition-colors disabled:opacity-30"
                >
                  <Download className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="font-mono text-xs">{t("downloadFile")}</TooltipContent>
            </Tooltip>
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
            <div className="space-y-px">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2.5 border-b border-white/5 last:border-0">
                  <Skeleton className="h-3 w-32 shrink-0 bg-zinc-700" />
                  <Skeleton className="h-5 w-16 rounded-full shrink-0 bg-zinc-700" />
                  <Skeleton className="h-3 flex-1 bg-zinc-700" />
                  <Skeleton className="h-3 w-20 shrink-0 bg-zinc-700" />
                </div>
              ))}
            </div>
          ) : rows.length === 0 ? (
            /* #9 한국어 empty state */
            <div className="flex h-48 flex-col items-center justify-center gap-3">
              <Terminal className="size-8 text-zinc-700" />
              <p className="font-mono text-base text-zinc-600">
                {hasFilter ? t("noLogsFilter") : t("noLogs")}
              </p>
              {hasFilter && (
                <button
                  onClick={() => {
                    setSearchInput("")
                    setSrcFilter("all")
                    setLvFilter([])
                  }}
                  className="font-mono text-xs text-zinc-500 hover:text-zinc-300 transition-colors underline underline-offset-2"
                >
                  {t("resetFilter")}
                </button>
              )}
            </div>
          ) : (
            <div className="pb-2">
              {rows.map((entry, i) => {
                const level = entry.level?.toLowerCase() ?? "info"
                const c = cfg(level)
                const src = entry.source ?? "app"
                const msg = entry.message || entry.raw || ""
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
                    {/* #1 행 클릭 → 상세 다이얼로그 */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => handleRowClick(entry)}
                      onKeyDown={(e) => e.key === "Enter" && handleRowClick(entry)}
                      className={cn(
                        "group flex items-start gap-0 transition-colors hover:bg-white/[0.04] cursor-pointer focus-visible:outline-none focus-visible:bg-white/[0.04]",
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
          {/* #7 검색 결과 맥락 */}
          <span className="font-mono text-xs text-zinc-600">
            {hasFilter ? (
              <>
                <span className="text-zinc-400">{rows.length.toLocaleString()}</span>
                <span className="text-zinc-600">
                  {" / "}
                  {t("lineCount", { count: totalCount.toLocaleString() })}
                </span>
                <span className="ml-1 text-amber-400/60">(filtered)</span>
              </>
            ) : (
              <>{t("lineCount", { count: rows.length.toLocaleString() })}</>
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

      {/* #1 로그 상세 다이얼로그 */}
      <LogDetailDialog
        entry={detailEntry}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LogsPage() {
  const tl = useTranslations("logs")

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
      </div>

      {/* ── Content ── */}
      <div className="flex min-h-0 flex-1 flex-col p-5">
        <LogPanel
          key="unified"
          apiPath="/api/logs/app"
          streamPath="/api/logs/gateway/stream"
          useSSE
        />
      </div>
    </div>
  )
}
