"use client"

import { useState } from "react"
import {
  Search, X, Loader2, AlertCircle, FileText, Info, BookOpenText,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { useTranslations } from "next-intl"
import type { SearchResult } from "./types"
import { similarityLabel } from "./types"

export default function DocSearchPanel({ onFileSelect }: { onFileSelect: (fileId: number) => void }) {
  const t = useTranslations("files")
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searchMode, setSearchMode] = useState("")
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState("")

  const doSearch = async () => {
    const q = query.trim()
    if (!q) return
    setSearching(true); setError("")
    try {
      const res = await fetch(`/api/files/search?q=${encodeURIComponent(q)}&limit=20`)
      if (!res.ok) throw new Error()
      const data = await res.json() as { results: SearchResult[]; search_mode: string }
      setResults(data.results ?? [])
      setSearchMode(data.search_mode ?? "")
      setSearched(true)
    } catch {
      setError(t("searchDocFailed"))
    } finally {
      setSearching(false)
    }
  }

  const modeLabel = searchMode === "semantic" ? t("searchDocModeSemantic") : searchMode === "full-text" ? t("searchDocModeFulltext") : ""

  return (
    <div className="flex flex-col h-full">
      {/* Search bar */}
      <div className="px-6 py-4 border-b border-border shrink-0">
        <p className="text-xs text-muted-foreground mb-2">{t("searchDocHint")}</p>
        <div className="flex items-start gap-2 text-xs bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-lg px-3 py-2 mb-3">
          <Info className="size-3.5 shrink-0 mt-0.5 text-blue-500" />
          <span className="text-blue-700 dark:text-blue-300 leading-relaxed">
            {t("searchIndexingHint")}
          </span>
        </div>
        <form
          onSubmit={e => { e.preventDefault(); doSearch() }}
          className="flex gap-2"
        >
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder={t("searchDocPlaceholder")}
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="pl-9"
              autoFocus
            />
            {query && (
              <button
                type="button"
                onClick={() => { setQuery(""); setResults([]); setSearched(false) }}
                className="absolute right-2 top-1/2 -translate-y-1/2"
              >
                <X className="size-4 text-muted-foreground" />
              </button>
            )}
          </div>
          <Button type="submit" disabled={searching || !query.trim()}>
            {searching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            <span className="ml-1.5">{t("searchDocButton")}</span>
          </Button>
        </form>
        {error && (
          <p className="mt-2 text-xs text-destructive flex items-center gap-1">
            <AlertCircle className="size-3.5" />{error}
          </p>
        )}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {searched && (
          <div className="px-6 py-2 border-b border-border flex items-center justify-between text-xs text-muted-foreground">
            <span>{results.length > 0 ? t("searchResultCount", { count: results.length }) : t("searchDocNoResult")}</span>
            {modeLabel && <span className="px-2 py-0.5 bg-muted rounded-full font-medium">{modeLabel}</span>}
          </div>
        )}
        {results.length === 0 && searched && !searching && (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
            <BookOpenText className="size-10 opacity-30" />
            <p className="text-sm">{t("searchDocNoResult")}</p>
          </div>
        )}
        <div className="divide-y divide-border/50">
          {results.map(r => {
            const sim = similarityLabel(r.similarity, { high: t("simHigh"), medium: t("simMedium"), low: t("simLow") })
            return (
              <div key={r.id} className="px-6 py-4 hover:bg-muted/30 transition-colors">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="size-4 shrink-0 text-blue-500" />
                    <span className="text-sm font-medium truncate">{r.file_name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded", sim.cls)}>
                      {sim.label}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => onFileSelect(r.file_id)}
                    >
                      {t("searchDocOpenFile")}
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3 bg-muted/40 rounded-md px-3 py-2">
                  {r.content}
                </p>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
