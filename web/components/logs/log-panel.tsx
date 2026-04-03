"use client"

import { useEffect, useState, useCallback, useRef, useMemo } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { AlertCircle, ArrowDown, Check, ClipboardCopy, Download, RefreshCw, Search, Terminal, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import type { LogEntry, LogResponse } from "./types"
import { ts, fullTs, dateLabel, sameDay, getCfg, SOURCE_COLOR } from "./types"
import { MessageContent } from "./log-helpers"
import { LogDetailDialog } from "./log-detail-dialog"

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => { const t = setTimeout(() => setDebounced(value), delay); return () => clearTimeout(t) }, [value, delay])
  return debounced
}

export function LogPanel({ apiPath, streamPath, useSSE }: { apiPath: string; streamPath?: string; useSSE: boolean }) {
  const t = useTranslations("logs")
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [sources, setSources] = useState<string[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [stats, setStats] = useState({ info: 0, warn: 0, error: 0 })
  const [loading, setLoading] = useState(true)
  const [live, setLive] = useState(true)
  const [searchInput, setSearchInput] = useState("")
  const search = useDebounce(searchInput, 300)
  const [srcFilter, setSrcFilter] = useState("all")
  const [lvFilter, setLvFilter] = useState<string[]>([])
  const [limit, setLimit] = useState("200")
  const [autoScroll, setAutoScroll] = useState(true)
  const [svcError, setSvcError] = useState<string | null>(null)
  const [detailEntry, setDetailEntry] = useState<LogEntry | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [allCopied, setAllCopied] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const esRef = useRef<EventSource | null>(null)
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
      if (d.error) { setSvcError(d.error) }
      else { setSvcError(null); setEntries(d.entries ?? []); setTotalCount(d.total ?? d.entries?.length ?? 0); if (d.stats) setStats(d.stats); if (d.sources) setSources(d.sources) }
    } catch { setSvcError(t("connectionFailed")) }
    finally { setLoading(false) }
  }, [apiPath, buildQS, t])

  const stopLive = useCallback(() => { esRef.current?.close(); esRef.current = null; clearInterval(timerRef.current ?? undefined); timerRef.current = null }, [])

  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return }
    if (live) { setLive(false); toast.info(t("filterChanged"), { description: t("filterChangedDesc"), duration: 3000 }) }
  }, [search, srcFilter, lvFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void fetchLogs(); stopLive()
    if (!live) return
    if (useSSE && streamPath) {
      const es = new EventSource(streamPath); esRef.current = es
      es.onmessage = (e) => { try { const entry: LogEntry = JSON.parse(e.data); setEntries(p => { const n = [...p, entry]; return n.length > 2000 ? n.slice(-2000) : n }) } catch {} }
    } else { timerRef.current = setInterval(() => { if (document.visibilityState === "visible") void fetchLogs() }, 3000) }
    return stopLive
  }, [live, useSSE, streamPath, fetchLogs, stopLive]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (autoScroll && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight }, [entries, autoScroll])
  const handleScroll = useCallback(() => { const el = scrollRef.current; if (!el) return; setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 60) }, [])
  const hasFilter = !!(searchInput || srcFilter !== "all" || lvFilter.length > 0)
  const rows = useMemo(() => [...entries].reverse(), [entries])

  const handleRowClick = (entry: LogEntry) => { setDetailEntry(entry); setDetailOpen(true) }
  const toggleStatFilter = (level: string) => setLvFilter(prev => prev.includes(level) ? prev.filter(l => l !== level) : [...prev, level])

  const handleCopyAll = async () => {
    const text = rows.map(e => { const c = getCfg(e.level); return `[${fullTs(e.time)}] [${c.label}] [${e.source ?? "app"}] ${e.message || e.raw || ""}` }).join("\n")
    await navigator.clipboard.writeText(text); setAllCopied(true); toast.success(t("copySuccess", { count: rows.length })); setTimeout(() => setAllCopied(false), 2000)
  }

  const handleDownload = () => {
    const text = rows.map(e => { const c = getCfg(e.level); return `[${fullTs(e.time)}] [${c.label}] [${e.source ?? "app"}] ${e.message || e.raw || ""}` }).join("\n")
    const blob = new Blob([text], { type: "text/plain" }); const url = URL.createObjectURL(blob)
    const a = document.createElement("a"); a.href = url; a.download = `logs_${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.txt`; a.click(); URL.revokeObjectURL(url)
    toast.success(t("downloadSuccess"))
  }

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Controls bar */}
      <div className="flex flex-wrap items-center gap-2">
        <TooltipProvider delayDuration={400}>
          <Tooltip><TooltipTrigger asChild>
            <Button size="sm" variant="outline" onClick={() => setLive(v => !v)}
              className={cn("h-8 gap-2 font-mono text-sm transition-all", live ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300" : "text-muted-foreground")}>
              <span className="relative flex size-2 shrink-0">{live && <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/60" />}<span className={cn("relative size-2 rounded-full", live ? "bg-emerald-400" : "bg-muted-foreground/40")} /></span>
              {live ? "LIVE" : "PAUSED"}
            </Button>
          </TooltipTrigger><TooltipContent side="bottom">{live ? t("pause") : t("resume")}</TooltipContent></Tooltip>

          <Tooltip><TooltipTrigger asChild>
            <Button size="sm" variant="ghost" onClick={() => void fetchLogs()} disabled={loading} className="size-8 p-0 text-muted-foreground hover:text-foreground">
              <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            </Button>
          </TooltipTrigger><TooltipContent side="bottom">{t("refresh")}</TooltipContent></Tooltip>

          <Separator orientation="vertical" className="mx-0.5 h-5" />

          <div className="relative min-w-[180px] flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/60" />
            <Input className="h-8 border-border/50 bg-background pl-8 pr-7 font-mono text-sm placeholder:text-muted-foreground/40 focus-visible:ring-1"
              placeholder="/ search logs..." value={searchInput} onChange={e => setSearchInput(e.target.value)} />
            {searchInput && <button onClick={() => setSearchInput("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground"><X className="size-3" /></button>}
          </div>

          <ToggleGroup type="multiple" value={lvFilter} onValueChange={v => setLvFilter(v)} variant="outline" size="sm" className="h-8 font-mono">
            <ToggleGroupItem value="info" className="px-2.5 text-xs tracking-wider data-[state=on]:border-sky-500/50 data-[state=on]:bg-sky-500/10 data-[state=on]:text-sky-400">INF</ToggleGroupItem>
            <ToggleGroupItem value="warn" className="px-2.5 text-xs tracking-wider data-[state=on]:border-amber-500/50 data-[state=on]:bg-amber-500/10 data-[state=on]:text-amber-400">WRN</ToggleGroupItem>
            <ToggleGroupItem value="error" className="px-2.5 text-xs tracking-wider data-[state=on]:border-red-500/50 data-[state=on]:bg-red-500/10 data-[state=on]:text-red-400">ERR</ToggleGroupItem>
          </ToggleGroup>

          <div className="w-[130px]">
            {sources.length > 0 ? (
              <Select value={srcFilter} onValueChange={setSrcFilter}>
                <SelectTrigger className="h-8 w-full border-border/50 font-mono text-sm"><SelectValue placeholder="all sources" /></SelectTrigger>
                <SelectContent><SelectItem value="all" className="font-mono text-sm">all sources</SelectItem>{sources.map(s => <SelectItem key={s} value={s} className="font-mono text-sm">[{s}]</SelectItem>)}</SelectContent>
              </Select>
            ) : <div className="h-8 w-full rounded-md border border-border/50 bg-background px-3 flex items-center"><span className="font-mono text-sm text-muted-foreground/40">all sources</span></div>}
          </div>

          <Select value={limit} onValueChange={setLimit}>
            <SelectTrigger className="h-8 w-[100px] border-border/50 font-mono text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>{["100", "200", "500", "1000", "2000"].map(n => <SelectItem key={n} value={n} className="font-mono text-sm">{n} lines</SelectItem>)}</SelectContent>
          </Select>

          <div className="ml-auto flex items-center gap-3 font-mono text-xs">
            {(["info", "warn", "error"] as const).map(lv => (
              <Tooltip key={lv}><TooltipTrigger asChild>
                <button onClick={() => toggleStatFilter(lv)} className={cn("transition-opacity hover:opacity-100", lvFilter.includes(lv) ? "opacity-100" : "opacity-60 hover:opacity-80")}>
                  <span className={lv === "info" ? "text-sky-400" : lv === "warn" ? (stats.warn > 0 ? "text-amber-400" : "text-zinc-600") : (stats.error > 0 ? "text-red-400" : "text-zinc-600")}>
                    {stats[lv === "warn" ? "warn" : lv]}
                  </span><span className="text-muted-foreground/50"> {lv === "info" ? "inf" : lv === "warn" ? "wrn" : "err"}</span>
                </button>
              </TooltipTrigger><TooltipContent side="bottom" className="font-mono text-xs">{t(`${lv === "info" ? "inf" : lv === "warn" ? "wrn" : "err"}Toggle`)}</TooltipContent></Tooltip>
            ))}
            <Separator orientation="vertical" className="h-4 mx-0.5" />
            <Tooltip><TooltipTrigger asChild><button onClick={handleCopyAll} disabled={rows.length === 0} className="text-muted-foreground/50 hover:text-zinc-300 transition-colors disabled:opacity-30">{allCopied ? <Check className="size-3.5 text-emerald-400" /> : <ClipboardCopy className="size-3.5" />}</button></TooltipTrigger><TooltipContent side="bottom" className="font-mono text-xs">{t("copyAll")}</TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger asChild><button onClick={handleDownload} disabled={rows.length === 0} className="text-muted-foreground/50 hover:text-zinc-300 transition-colors disabled:opacity-30"><Download className="size-3.5" /></button></TooltipTrigger><TooltipContent side="bottom" className="font-mono text-xs">{t("downloadFile")}</TooltipContent></Tooltip>
          </div>
        </TooltipProvider>
      </div>

      {/* Terminal window */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-white/[0.07] bg-zinc-950 ring-1 ring-inset ring-white/[0.04]">
        <div ref={scrollRef} onScroll={handleScroll} className="min-h-0 flex-1 overflow-y-auto">
          {svcError ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
              <div className="rounded-full border border-red-400/20 bg-red-400/10 p-4"><AlertCircle className="size-6 text-red-400" /></div>
              <div className="text-center"><p className="font-mono text-base text-red-400">{svcError}</p><p className="mt-1 font-mono text-sm text-zinc-600">{t("checkServer")}</p></div>
              <Button variant="outline" size="sm" onClick={() => void fetchLogs()} className="mt-2 border-white/10 bg-white/5 font-mono text-sm text-zinc-400 hover:bg-white/10 hover:text-zinc-200"><RefreshCw className="mr-2 size-3" />{t("retry")}</Button>
            </div>
          ) : loading && rows.length === 0 ? (
            <div className="space-y-px">{Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2.5 border-b border-white/5 last:border-0"><Skeleton className="h-3 w-32 shrink-0 bg-zinc-700" /><Skeleton className="h-5 w-16 rounded-full shrink-0 bg-zinc-700" /><Skeleton className="h-3 flex-1 bg-zinc-700" /><Skeleton className="h-3 w-20 shrink-0 bg-zinc-700" /></div>
            ))}</div>
          ) : rows.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center gap-3">
              <Terminal className="size-8 text-zinc-700" /><p className="font-mono text-base text-zinc-600">{hasFilter ? t("noLogsFilter") : t("noLogs")}</p>
              {hasFilter && <button onClick={() => { setSearchInput(""); setSrcFilter("all"); setLvFilter([]) }} className="font-mono text-xs text-zinc-500 hover:text-zinc-300 transition-colors underline underline-offset-2">{t("resetFilter")}</button>}
            </div>
          ) : (
            <div className="pb-2">{rows.map((entry, i) => {
              const level = entry.level?.toLowerCase() ?? "info"
              const c = getCfg(level); const src = entry.source ?? "app"; const msg = entry.message || entry.raw || ""
              const prev = rows[i - 1]; const showDay = i === 0 || (entry.time && prev?.time && !sameDay(entry.time, prev.time))
              return (
                <div key={entry.time_ms ? `${entry.time_ms}-${i}` : i}>
                  {showDay && entry.time && <div className="my-3 flex items-center gap-3 px-4"><div className="h-px flex-1 bg-white/[0.05]" /><span className="font-mono text-xs text-zinc-600">{dateLabel(entry.time)}</span><div className="h-px flex-1 bg-white/[0.05]" /></div>}
                  <div role="button" tabIndex={0} onClick={() => handleRowClick(entry)} onKeyDown={e => e.key === "Enter" && handleRowClick(entry)}
                    className={cn("group flex items-start gap-0 transition-colors hover:bg-white/[0.04] cursor-pointer focus-visible:outline-none focus-visible:bg-white/[0.04]", c.row)}>
                    <span className={cn("w-24 shrink-0 select-none px-4 py-0.5 font-mono text-xs tabular-nums", c.time)}>{ts(entry.time)}</span>
                    <span className={cn("w-10 shrink-0 py-0.5 font-mono text-xs font-semibold tracking-wider", c.lv)}>{c.label}</span>
                    <span className={cn("w-24 shrink-0 truncate py-0.5 pr-2 font-mono text-xs font-medium", SOURCE_COLOR[src] ?? "text-zinc-400")}>{src}</span>
                    <span className={cn("flex-1 break-all py-0.5 pr-4 font-mono text-xs leading-relaxed whitespace-pre-wrap", c.msg)}><MessageContent text={msg} q={search} /></span>
                  </div>
                </div>
              )
            })}</div>
          )}
        </div>

        {/* Status bar */}
        <div className="flex shrink-0 items-center justify-between border-t border-white/[0.05] bg-zinc-900/40 px-4 py-1.5">
          <span className="font-mono text-xs text-zinc-600">
            {hasFilter ? <><span className="text-zinc-400">{rows.length.toLocaleString()}</span><span className="text-zinc-600"> / {t("lineCount", { count: totalCount.toLocaleString() })}</span><span className="ml-1 text-amber-400/60">(filtered)</span></> : <>{t("lineCount", { count: rows.length.toLocaleString() })}</>}
          </span>
          <div className="flex items-center gap-3">
            {!autoScroll && <button onClick={() => { setAutoScroll(true); if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight }} className="flex items-center gap-1 font-mono text-xs text-zinc-500 transition-colors hover:text-zinc-300"><ArrowDown className="size-3" />scroll to bottom</button>}
            {live && <span className="flex items-center gap-1.5 font-mono text-xs text-emerald-500/70"><span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />{useSSE ? "sse" : "poll/3s"}</span>}
          </div>
        </div>
      </div>

      <LogDetailDialog entry={detailEntry} open={detailOpen} onOpenChange={setDetailOpen} />
    </div>
  )
}
