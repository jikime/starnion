"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  AlertTriangle,
  BookmarkCheck,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  Check,
  Eye,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"

// ─── Types ────────────────────────────────────────────────────────────────────

interface SavedSearch {
  id: number
  query: string
  result: string
  created_at: string
}

// ─── Search suggestions ────────────────────────────────────────────────────────
// #8: 검색 예시 칩 — moved inside component for i18n


// ─── Helpers ──────────────────────────────────────────────────────────────────

// #5: 상대 시간 포맷
function formatRelativeDate(raw: string, labels: { justNow: string; minutesAgo: (n: number) => string; hoursAgo: (n: number) => string; daysAgo: (n: number) => string }): string {
  const d = new Date(raw)
  if (isNaN(d.getTime())) return raw
  const diffMs = Date.now() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)
  if (diffMin < 1) return labels.justNow
  if (diffMin < 60) return labels.minutesAgo(diffMin)
  if (diffHour < 24) return labels.hoursAgo(diffHour)
  if (diffDay < 7) return labels.daysAgo(diffDay)
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

// ─── Stream helper ────────────────────────────────────────────────────────────

async function streamSearch(
  query: string,
  onText: (delta: string) => void,
  signal: AbortSignal
): Promise<string> {
  const res = await fetch("/api/search/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
    signal,
  })
  if (!res.ok || !res.body) throw new Error("streamFailed")

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ""
  let full = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split("\n")
    buf = lines.pop() ?? ""
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue
      const raw = line.slice(6).trim()
      if (raw === "[DONE]") return full
      try {
        const chunk = JSON.parse(raw)
        if (chunk.type === "text-delta" && chunk.delta) {
          full += chunk.delta as string
          onText(chunk.delta as string)
        } else if (chunk.type === "error") {
          throw new Error(chunk.errorText ?? "agent error")
        }
      } catch { /* skip malformed */ }
    }
  }
  return full
}

// ─── Markdown renderer ───────────────────────────────────────────────────────

function Md({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer"
            className="text-primary underline underline-offset-2 hover:opacity-80">
            {children}
          </a>
        ),
        p: ({ children }) => <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>,
        ul: ({ children }) => <ul className="mb-3 ml-4 list-disc space-y-1">{children}</ul>,
        ol: ({ children }) => <ol className="mb-3 ml-4 list-decimal space-y-1">{children}</ol>,
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        h1: ({ children }) => <h1 className="mb-2 text-lg font-bold">{children}</h1>,
        h2: ({ children }) => <h2 className="mb-2 text-base font-semibold">{children}</h2>,
        h3: ({ children }) => <h3 className="mb-1 text-sm font-semibold">{children}</h3>,
        code: ({ children, className }) => {
          const isBlock = className?.includes("language-")
          return isBlock
            ? <code className="block rounded-md bg-muted px-3 py-2 text-xs font-mono my-2 overflow-x-auto">{children}</code>
            : <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">{children}</code>
        },
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-primary/40 pl-3 italic text-muted-foreground my-2">
            {children}
          </blockquote>
        ),
        hr: () => <Separator className="my-3" />,
      }}
    >
      {content}
    </ReactMarkdown>
  )
}

// ─── History Panel ────────────────────────────────────────────────────────────

function HistoryPanel({
  items,
  loading,
  currentQuery,
  onView,
  onReSearch,
  onDeleteRequest,
  t,
}: {
  items: SavedSearch[]
  loading: boolean
  currentQuery: string
  onView: (item: SavedSearch) => void
  onReSearch: (query: string) => void
  onDeleteRequest: (item: SavedSearch) => void
  t: ReturnType<typeof useTranslations>
}) {
  return (
    <div className="p-2">
      {loading ? (
        <div className="space-y-0.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg px-3 py-2">
              <Skeleton className="size-3.5 shrink-0 rounded-full" />
              <Skeleton className="h-3.5 flex-1" style={{ width: `${50 + (i % 4) * 12}%` }} />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center py-8 gap-2 text-muted-foreground">
          <Clock className="size-6 opacity-30" />
          <p className="text-xs">{t("noSavedSearches")}</p>
        </div>
      ) : (
        <div className="space-y-0.5">
          {items.map((item) => (
            <div
              key={item.id}
              className={cn(
                "group flex items-start gap-2 rounded-lg px-3 py-2",
                "hover:bg-muted/50 transition-colors",
                currentQuery === item.query && "bg-primary/5"
              )}
            >
              <Clock className="size-3 text-muted-foreground/40 shrink-0 mt-1.5" />
              {/* Item text — 저장 결과 보기 */}
              <button
                className="flex-1 text-left min-w-0"
                onClick={() => onView(item)}
              >
                <p className={cn(
                  "text-sm truncate leading-snug",
                  currentQuery === item.query && "text-primary font-medium"
                )}>
                  {item.query}
                </p>
                {/* #5: 상대 시간 */}
                <p className="text-xs text-muted-foreground">{formatRelativeDate(item.created_at, {
                    justNow: t("justNow"),
                    minutesAgo: (n) => t("minutesAgo", { n }),
                    hoursAgo: (n) => t("hoursAgo", { n }),
                    daysAgo: (n) => t("daysAgo", { n }),
                  })}</p>
              </button>
              {/* #6: 액션 버튼 명확화 — 보기 / 재검색 */}
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 text-muted-foreground hover:text-primary"
                  title={t("viewSaved")}
                  onClick={() => onView(item)}
                >
                  <Eye className="size-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 text-muted-foreground hover:text-indigo-500"
                  title={t("reSearch")}
                  onClick={() => onReSearch(item.query)}
                >
                  <RefreshCw className="size-3" />
                </Button>
                {/* #1: 삭제 → AlertDialog 트리거 */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 text-muted-foreground hover:text-destructive"
                  title={t("deleteButton")}
                  onClick={() => onDeleteRequest(item)}
                >
                  <Trash2 className="size-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SearchPage() {
  const t = useTranslations("search")

  // #8: 검색 예시 칩
  const SEARCH_SUGGESTIONS = [
    t("suggestion1"),
    t("suggestion2"),
    t("suggestion3"),
    t("suggestion4"),
    t("suggestion5"),
    t("suggestion6"),
  ]

  const [query, setQuery]               = useState("")
  const [result, setResult]             = useState("")
  const [currentQuery, setCurrentQuery] = useState("")
  const [status, setStatus]             = useState<"idle" | "searching" | "done" | "error">("idle")
  const [error, setError]               = useState("")
  const [saved, setSaved]               = useState(false)
  const [saveFailed, setSaveFailed]     = useState(false)
  const [saving, setSaving]             = useState(false)
  // #4: 복사
  const [copied, setCopied]             = useState(false)

  const [history, setHistory]               = useState<SavedSearch[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [showHistory, setShowHistory]       = useState(true)
  // #7: 모바일 히스토리 접힘
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false)
  // #1: 삭제 확인
  const [deleteTarget, setDeleteTarget]     = useState<SavedSearch | null>(null)

  const abortRef = useRef<AbortController | null>(null)

  // ── Load saved searches ──────────────────────────────────────────────────

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const res = await fetch("/api/search")
      if (res.ok) {
        const data = await res.json()
        setHistory(Array.isArray(data) ? data : (Array.isArray(data?.searches) ? data.searches : []))
      }
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  useEffect(() => { loadHistory() }, [loadHistory])

  // ── Search ────────────────────────────────────────────────────────────────

  const handleSearch = useCallback(async (q?: string) => {
    const searchQuery = (q ?? query).trim()
    if (!searchQuery) return

    // 검색 중이면 중단 후 새 검색
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setCurrentQuery(searchQuery)
    setResult("")
    setError("")
    setSaved(false)
    setSaveFailed(false)
    setStatus("searching")

    try {
      const fullResult = await streamSearch(searchQuery, (delta) => setResult((r) => r + delta), ctrl.signal)
      setStatus("done")
      if (fullResult) {
        // #2: 자동 저장 — 완료 즉시 저장, UI는 "자동 저장됨" 표시
        setSaved(true)
        fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: searchQuery, result: fullResult }),
        }).then(res => {
          if (res.ok) loadHistory()
          else { setSaved(false); setSaveFailed(true) }
        }).catch(() => { setSaved(false); setSaveFailed(true) })
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return
      const msg = e instanceof Error ? e.message : "error"
      setError(msg === "streamFailed" ? t("streamFailed") : msg)
      setStatus("error")
    }
  }, [query, loadHistory, t])

  const handleStop = () => {
    abortRef.current?.abort()
    setStatus("done")
  }

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    handleSearch()
  }

  // #2: 저장 실패 시 수동 재시도
  const handleSaveRetry = async () => {
    if (!currentQuery || !result || saving) return
    setSaving(true)
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: currentQuery, result }),
      })
      if (res.ok) { setSaved(true); setSaveFailed(false); loadHistory() }
    } finally {
      setSaving(false)
    }
  }

  // ── View saved / Re-search ────────────────────────────────────────────────

  // #6: 저장된 결과만 보기
  function handleViewSaved(item: SavedSearch) {
    setQuery(item.query)
    setCurrentQuery(item.query)
    setResult(item.result)
    setError("")
    setSaved(true)
    setSaveFailed(false)
    setStatus("done")
  }

  // #6: 실제 재검색
  function handleActualReSearch(q: string) {
    setQuery(q)
    handleSearch(q)
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  // #1: 삭제 확인 후 실행
  async function handleDeleteConfirm() {
    if (!deleteTarget) return
    const id = deleteTarget.id
    setDeleteTarget(null)
    await fetch(`/api/search/${id}`, { method: "DELETE" })
    setHistory((prev) => prev.filter((h) => h.id !== id))
  }

  useEffect(() => () => abortRef.current?.abort(), [])

  const searching = status === "searching"

  const uniqueHistory = history.reduce<SavedSearch[]>((acc, item) => {
    if (!acc.some(h => h.query === item.query)) acc.push(item)
    return acc
  }, [])

  const historyHeader = (
    <div className="flex items-center justify-between px-4 py-3.5 border-b border-border/60">
      <div className="flex items-center gap-2">
        <div className="rounded-lg p-1.5 bg-amber-100 dark:bg-amber-950/50">
          <Clock className="size-3.5 text-amber-600 dark:text-amber-400" />
        </div>
        <p className="font-semibold text-sm">{t("savedSearches")}</p>
        {uniqueHistory.length > 0 && (
          <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">
            {uniqueHistory.length}
          </span>
        )}
      </div>
      {/* #10: 데스크탑에서만 닫기 버튼 */}
      <Button
        variant="ghost"
        size="icon"
        className="size-7 hidden lg:flex"
        onClick={() => setShowHistory(false)}
      >
        <X className="size-3.5" />
      </Button>
      {/* 모바일 접힘 토글 */}
      <Button
        variant="ghost"
        size="icon"
        className="size-7 lg:hidden"
        onClick={() => setMobileHistoryOpen((v) => !v)}
      >
        {mobileHistoryOpen
          ? <ChevronUp className="size-3.5" />
          : <ChevronDown className="size-3.5" />}
      </Button>
    </div>
  )

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Search className="size-6 text-primary" />
            {t("webTitle")}
          </h1>
          <p className="text-muted-foreground">{t("webSubtitle")}</p>
        </div>
        {/* #10: 히스토리 토글 — "열기/닫기" 명확히 */}
        <Button
          variant="outline"
          size="sm"
          className="gap-2 hidden lg:flex"
          onClick={() => setShowHistory(!showHistory)}
        >
          <Clock className="size-4" />
          {showHistory ? t("hideHistory") : t("showHistory")}
          {uniqueHistory.length > 0 && (
            <span className="text-xs px-1.5 py-0 rounded-full bg-muted text-muted-foreground font-medium">
              {uniqueHistory.length}
            </span>
          )}
        </Button>
      </div>

      {/* #7: 모바일 히스토리 — 검색 위에 접힘 패널 */}
      <div className="lg:hidden">
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {historyHeader}
          {mobileHistoryOpen && (
            <HistoryPanel
              items={uniqueHistory}
              loading={historyLoading}
              currentQuery={currentQuery}
              onView={handleViewSaved}
              onReSearch={handleActualReSearch}
              onDeleteRequest={setDeleteTarget}
              t={t}
            />
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* ── Main panel ──────────────────────────────────────────────────── */}
        <div className="space-y-4">

          {/* Search input */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-border/60">
              <div className="rounded-lg p-1.5 bg-indigo-100 dark:bg-indigo-950/50">
                <Search className="size-4 text-indigo-600 dark:text-indigo-400" />
              </div>
              <p className="font-semibold text-sm">{t("webTitle")}</p>
            </div>
            <div className="p-4 space-y-3">
              <form onSubmit={handleSubmit} className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder={t("inputPlaceholder")}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="pl-9"
                    // #9: 검색 중에도 입력 가능
                  />
                </div>
                {searching ? (
                  <Button type="button" variant="destructive" onClick={handleStop} className="gap-2 shrink-0">
                    <X className="size-4" />
                    {t("stop")}
                  </Button>
                ) : (
                  <Button type="submit" disabled={!query.trim()} className="gap-2 shrink-0">
                    <Search className="size-4" />
                    {t("button")}
                  </Button>
                )}
              </form>

              {/* #8: 검색 예시 칩 */}
              {status === "idle" && (
                <div className="flex flex-wrap gap-1.5">
                  {SEARCH_SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => { setQuery(s); handleSearch(s) }}
                      className="text-xs px-2.5 py-1 rounded-full border border-border bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Result panel */}
          {(result || searching || status === "error") && (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              {/* Result header */}
              <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border/60">
                <div className="flex items-center gap-2 min-w-0">
                  {searching ? (
                    <RefreshCw className="size-4 animate-spin text-indigo-500 shrink-0" />
                  ) : status === "error" ? (
                    <AlertTriangle className="size-4 text-destructive shrink-0" />
                  ) : (
                    <div className="size-2 rounded-full bg-emerald-400 shrink-0" />
                  )}
                  <p className="font-medium text-sm truncate">{currentQuery}</p>
                  {searching && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800 font-medium shrink-0">
                      {t("searchingPrefix")}
                    </span>
                  )}
                </div>

                {status === "done" && result && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* #4: 복사 버튼 */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 h-7 text-xs"
                      onClick={() => {
                        navigator.clipboard.writeText(result)
                        setCopied(true)
                        setTimeout(() => setCopied(false), 2000)
                      }}
                    >
                      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                      {copied ? t("copied") : t("copy")}
                    </Button>
                    {/* #2: 자동 저장 상태 표시 */}
                    {saved ? (
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground px-2 py-1 rounded-lg bg-muted/50">
                        <BookmarkCheck className="size-3.5 text-emerald-500" />
                        {t("autoSaved")}
                      </span>
                    ) : saveFailed ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 h-7 text-xs text-destructive border-destructive/40 hover:bg-destructive/10"
                        onClick={handleSaveRetry}
                        disabled={saving}
                      >
                        {saving
                          ? <RefreshCw className="size-3.5 animate-spin" />
                          : <RefreshCw className="size-3.5" />
                        }
                        {t("saveRetry")}
                      </Button>
                    ) : null}
                  </div>
                )}
              </div>

              {/* Result body */}
              <div className="px-5 py-4">
                {status === "error" ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                      <AlertTriangle className="size-4 shrink-0" />
                      {error}
                    </div>
                    {/* #3: 오류 시 재시도 버튼 */}
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => handleSearch(currentQuery)}
                    >
                      <RefreshCw className="size-4" />
                      {t("retrySearch")}
                    </Button>
                  </div>
                ) : (
                  <div className="prose prose-sm dark:prose-invert max-w-none text-sm">
                    <Md content={result} />
                    {searching && (
                      <span className="inline-block h-4 w-0.5 animate-pulse bg-foreground align-middle ml-0.5" />
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Empty state */}
          {status === "idle" && (
            <div className="flex flex-col items-center py-12 text-muted-foreground gap-4 rounded-xl border-2 border-dashed border-border">
              <div className="rounded-full p-5 bg-muted/50">
                <Search className="size-8 opacity-30" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm">{t("webEmptyState")}</p>
                {uniqueHistory.length > 0 && (
                  <p className="text-xs opacity-70">{t("historyHint")}</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Desktop History sidebar ─────────────────────────────────────── */}
        {/* #7: 데스크탑에서만 표시 */}
        {showHistory && (
          <div className="hidden lg:block">
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              {historyHeader}
              <HistoryPanel
                items={uniqueHistory}
                loading={historyLoading}
                currentQuery={currentQuery}
                onView={handleViewSaved}
                onReSearch={handleActualReSearch}
                onDeleteRequest={setDeleteTarget}
                t={t}
              />
            </div>
          </div>
        )}
      </div>

      {/* #1: 삭제 확인 AlertDialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium">"{deleteTarget?.query}"</span> {t("deleteConfirmDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancelButton")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("deleteButton")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
