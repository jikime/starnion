"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { useTranslations } from "next-intl"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Bookmark, BookmarkCheck, Clock, RefreshCw, Search, Trash2, X } from "lucide-react"

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

interface SavedSearch {
  id: number
  query: string
  result: string
  created_at: string
}

// ────────────────────────────────────────────────────────────────────────────
// Stream helper
// ────────────────────────────────────────────────────────────────────────────

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

// ────────────────────────────────────────────────────────────────────────────
// Markdown renderer
// ────────────────────────────────────────────────────────────────────────────

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

// ────────────────────────────────────────────────────────────────────────────
// Page
// ────────────────────────────────────────────────────────────────────────────

export default function SearchPage() {
  const t = useTranslations("search")

  const [query, setQuery] = useState("")
  const [result, setResult] = useState("")
  const [currentQuery, setCurrentQuery] = useState("")
  const [status, setStatus] = useState<"idle" | "searching" | "done" | "error">("idle")
  const [error, setError] = useState("")
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  const [history, setHistory] = useState<SavedSearch[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [showHistory, setShowHistory] = useState(false)

  const abortRef = useRef<AbortController | null>(null)

  // ── Load saved searches ──────────────────────────────────────────────────

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const res = await fetch("/api/search")
      if (res.ok) setHistory(await res.json())
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  useEffect(() => { loadHistory() }, [loadHistory])

  // ── Search ────────────────────────────────────────────────────────────────

  const handleSearch = async (q?: string) => {
    const searchQuery = (q ?? query).trim()
    if (!searchQuery || status === "searching") return

    // Cancel any in-flight request
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setCurrentQuery(searchQuery)
    setResult("")
    setError("")
    setSaved(false)
    setStatus("searching")

    try {
      const fullResult = await streamSearch(searchQuery, (delta) => setResult((r) => r + delta), ctrl.signal)
      setStatus("done")
      // Auto-save the AI summary so history always has the full response
      if (fullResult) {
        setSaved(true)
        fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: searchQuery, result: fullResult }),
        }).then(res => { if (res.ok) loadHistory() }).catch(() => setSaved(false))
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return
      const msg = e instanceof Error ? e.message : "error"
      setError(msg === "streamFailed" ? t("streamFailed") : msg)
      setStatus("error")
    }
  }

  const handleStop = () => {
    abortRef.current?.abort()
    setStatus("done")
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    handleSearch()
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!currentQuery || !result || saving) return
    setSaving(true)
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: currentQuery, result }),
      })
      if (res.ok) {
        setSaved(true)
        loadHistory()
      }
    } finally {
      setSaving(false)
    }
  }

  // ── Delete history item ──────────────────────────────────────────────────

  const handleDelete = async (id: number) => {
    await fetch(`/api/search/${id}`, { method: "DELETE" })
    setHistory((prev) => prev.filter((h) => h.id !== id))
  }

  // ── Load cached result from history ───────────────────────────────────────

  const handleReSearch = (item: SavedSearch) => {
    setQuery(item.query)
    setCurrentQuery(item.query)
    setResult(item.result)
    setError("")
    setSaved(true)
    setStatus("done")
    setShowHistory(false)
  }

  // ── Cleanup on unmount ────────────────────────────────────────────────────

  useEffect(() => () => abortRef.current?.abort(), [])

  const searching = status === "searching"

  // Deduplicate history: keep only the most recent entry per unique query
  // (auto-save from tool + manual save can create duplicates; latest = AI summary)
  const uniqueHistory = history.reduce<SavedSearch[]>((acc, item) => {
    if (!acc.some(h => h.query === item.query)) acc.push(item)
    return acc
  }, [])

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Search className="size-6 text-primary" />
            {t("webTitle")}
          </h1>
          <p className="text-muted-foreground">{t("webSubtitle")}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => setShowHistory(!showHistory)}
        >
          <Clock className="size-4" />
          {t("savedSearches")}
          {uniqueHistory.length > 0 && (
            <Badge variant="secondary" className="text-xs px-1.5">{uniqueHistory.length}</Badge>
          )}
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* ── Main panel ──────────────────────────────────────────────────── */}
        <div className="space-y-4">
          {/* Search input */}
          <Card>
            <CardContent className="pt-5 pb-4">
              <form onSubmit={handleSubmit} className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder={t("inputPlaceholder")}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="pl-9"
                    disabled={searching}
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
            </CardContent>
          </Card>

          {/* Result */}
          {(result || searching || status === "error") && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    {searching && <RefreshCw className="size-4 animate-spin text-primary" />}
                    {currentQuery && (
                      <span className="truncate">
                        {searching ? t("searchingPrefix") : ""}{currentQuery}
                      </span>
                    )}
                  </CardTitle>

                  {/* Save indicator / manual save button for stopped searches */}
                  {status === "done" && result && (
                    saved ? (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                        <BookmarkCheck className="size-3.5" />
                        {t("saved")}
                      </span>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 shrink-0"
                        onClick={handleSave}
                        disabled={saving}
                      >
                        {saving ? (
                          <RefreshCw className="size-3.5 animate-spin" />
                        ) : (
                          <Bookmark className="size-3.5" />
                        )}
                        {t("save")}
                      </Button>
                    )
                  )}
                </div>
              </CardHeader>
              <Separator />
              <CardContent className="pt-4">
                {status === "error" ? (
                  <p className="text-sm text-destructive">{error}</p>
                ) : (
                  <div className="prose prose-sm dark:prose-invert max-w-none text-sm">
                    <Md content={result} />
                    {searching && (
                      <span className="inline-block h-4 w-0.5 animate-pulse bg-foreground align-middle" />
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Empty state */}
          {status === "idle" && (
            <div className="flex flex-col items-center py-16 text-muted-foreground gap-3">
              <Search className="size-12 opacity-20" />
              <p className="text-sm">{t("webEmptyState")}</p>
              {uniqueHistory.length > 0 && (
                <p className="text-xs">{t("historyHint")}</p>
              )}
            </div>
          )}
        </div>

        {/* ── History sidebar ──────────────────────────────────────────────── */}
        {showHistory && (
          <div className="space-y-3">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">{t("savedSearches")}</CardTitle>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowHistory(false)}>
                    <X className="size-3.5" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-0 pb-3">
                {historyLoading ? (
                  <div className="flex justify-center py-6">
                    <RefreshCw className="size-4 animate-spin text-muted-foreground" />
                  </div>
                ) : history.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-6">
                    {t("noSavedSearches")}
                  </p>
                ) : (
                  <div className="space-y-1">
                    {uniqueHistory.map((item) => (
                      <div
                        key={item.id}
                        className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50 transition-colors"
                      >
                        <button
                          className="flex-1 text-left min-w-0"
                          onClick={() => handleReSearch(item)}
                        >
                          <p className="text-sm truncate">{item.query}</p>
                          <p className="text-xs text-muted-foreground">{item.created_at}</p>
                        </button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive shrink-0"
                          onClick={() => handleDelete(item.id)}
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
