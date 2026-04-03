"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { ChevronDown, ChevronUp, Clock, Search, X } from "lucide-react"
import type { SavedSearch } from "@/components/search/types"
import { streamSearch } from "@/components/search/stream-search"
import { HistoryPanel } from "@/components/search/history-panel"
import { SearchInput } from "@/components/search/search-input"
import { SearchResult, SearchEmptyState } from "@/components/search/search-result"

export default function SearchPage() {
  const t = useTranslations("search")

  const [query, setQuery] = useState("")
  const [result, setResult] = useState("")
  const [currentQuery, setCurrentQuery] = useState("")
  const [status, setStatus] = useState<"idle" | "searching" | "done" | "error">("idle")
  const [error, setError] = useState("")
  const [saved, setSaved] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const [saving, setSaving] = useState(false)

  const [history, setHistory] = useState<SavedSearch[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [showHistory, setShowHistory] = useState(true)
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<SavedSearch | null>(null)

  const abortRef = useRef<AbortController | null>(null)

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

  const handleSearch = useCallback(async (q?: string) => {
    const searchQuery = (q ?? query).trim()
    if (!searchQuery) return

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
      const fullResult = await streamSearch(searchQuery, (delta) => setResult(r => r + delta), ctrl.signal)
      setStatus("done")
      if (fullResult) {
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

  const handleStop = () => { abortRef.current?.abort(); setStatus("done") }

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
    } finally { setSaving(false) }
  }

  function handleViewSaved(item: SavedSearch) {
    setQuery(item.query)
    setCurrentQuery(item.query)
    setResult(item.result)
    setError("")
    setSaved(true)
    setSaveFailed(false)
    setStatus("done")
  }

  function handleActualReSearch(q: string) {
    setQuery(q)
    handleSearch(q)
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return
    const id = deleteTarget.id
    setDeleteTarget(null)
    await fetch(`/api/search/${id}`, { method: "DELETE" })
    setHistory(prev => prev.filter(h => h.id !== id))
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
          <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">{uniqueHistory.length}</span>
        )}
      </div>
      <Button variant="ghost" size="icon" className="size-7 hidden lg:flex" onClick={() => setShowHistory(false)}>
        <X className="size-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="size-7 lg:hidden" onClick={() => setMobileHistoryOpen(v => !v)}>
        {mobileHistoryOpen ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
      </Button>
    </div>
  )

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Search className="size-6 text-primary" />
            {t("webTitle")}
          </h1>
          <p className="text-muted-foreground">{t("webSubtitle")}</p>
        </div>
        <Button variant="outline" size="sm" className="gap-2 hidden lg:flex" onClick={() => setShowHistory(!showHistory)}>
          <Clock className="size-4" />
          {showHistory ? t("hideHistory") : t("showHistory")}
          {uniqueHistory.length > 0 && (
            <span className="text-xs px-1.5 py-0 rounded-full bg-muted text-muted-foreground font-medium">{uniqueHistory.length}</span>
          )}
        </Button>
      </div>

      {/* Mobile history */}
      <div className="lg:hidden">
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {historyHeader}
          {mobileHistoryOpen && (
            <HistoryPanel items={uniqueHistory} loading={historyLoading} currentQuery={currentQuery}
              onView={handleViewSaved} onReSearch={handleActualReSearch} onDeleteRequest={setDeleteTarget} />
          )}
        </div>
      </div>

      <div className={cn("grid gap-6", showHistory ? "lg:grid-cols-[1fr_320px]" : "grid-cols-1")}>
        {/* Main panel */}
        <div className="space-y-4">
          <SearchInput query={query} onQueryChange={setQuery} onSubmit={() => handleSearch()}
            onStop={handleStop} searching={searching} showSuggestions={status === "idle"}
            onSuggestionClick={s => { setQuery(s); handleSearch(s) }} />

          <SearchResult result={result} currentQuery={currentQuery} status={status} error={error}
            saved={saved} saveFailed={saveFailed} saving={saving} searching={searching}
            onRetry={() => handleSearch(currentQuery)} onSaveRetry={handleSaveRetry} />

          {status === "idle" && <SearchEmptyState historyCount={uniqueHistory.length} />}
        </div>

        {/* Desktop history sidebar */}
        {showHistory && (
          <div className="hidden lg:block">
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              {historyHeader}
              <HistoryPanel items={uniqueHistory} loading={historyLoading} currentQuery={currentQuery}
                onView={handleViewSaved} onReSearch={handleActualReSearch} onDeleteRequest={setDeleteTarget} />
            </div>
          </div>
        )}
      </div>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium">&quot;{deleteTarget?.query}&quot;</span> {t("deleteConfirmDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancelButton")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t("deleteButton")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
