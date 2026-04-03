"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { AlertTriangle, BookmarkCheck, Check, Copy, RefreshCw, Search, X } from "lucide-react"
import { useTranslations } from "next-intl"
import { Md } from "./markdown-renderer"

export function SearchResult({
  result,
  currentQuery,
  status,
  error,
  saved,
  saveFailed,
  saving,
  searching,
  onRetry,
  onSaveRetry,
}: {
  result: string
  currentQuery: string
  status: "idle" | "searching" | "done" | "error"
  error: string
  saved: boolean
  saveFailed: boolean
  saving: boolean
  searching: boolean
  onRetry: () => void
  onSaveRetry: () => void
}) {
  const t = useTranslations("search")
  const [copied, setCopied] = useState(false)

  if (!result && !searching && status !== "error") return null

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
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
            <Button variant="ghost" size="sm" className="gap-1.5 h-7 text-xs"
              onClick={() => { navigator.clipboard.writeText(result); setCopied(true); setTimeout(() => setCopied(false), 2000) }}>
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? t("copied") : t("copy")}
            </Button>
            {saved ? (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground px-2 py-1 rounded-lg bg-muted/50">
                <BookmarkCheck className="size-3.5 text-emerald-500" />{t("autoSaved")}
              </span>
            ) : saveFailed ? (
              <Button variant="outline" size="sm"
                className="gap-1.5 h-7 text-xs text-destructive border-destructive/40 hover:bg-destructive/10"
                onClick={onSaveRetry} disabled={saving}>
                <RefreshCw className={`size-3.5 ${saving ? "animate-spin" : ""}`} />
                {t("saveRetry")}
              </Button>
            ) : null}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="px-5 py-4">
        {status === "error" ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertTriangle className="size-4 shrink-0" />{error}
            </div>
            <Button variant="outline" size="sm" className="gap-2" onClick={onRetry}>
              <RefreshCw className="size-4" />{t("retrySearch")}
            </Button>
          </div>
        ) : (
          <div className="max-w-none text-sm markdown-body">
            <Md content={result} />
            {searching && (
              <span className="inline-block h-4 w-0.5 animate-pulse bg-foreground align-middle ml-0.5" />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export function SearchEmptyState({ historyCount }: { historyCount: number }) {
  const t = useTranslations("search")
  return (
    <div className="flex flex-col items-center py-12 text-muted-foreground gap-4 rounded-xl border-2 border-dashed border-border">
      <div className="rounded-full p-5 bg-muted/50">
        <Search className="size-8 opacity-30" />
      </div>
      <div className="text-center space-y-1">
        <p className="text-sm">{t("webEmptyState")}</p>
        {historyCount > 0 && <p className="text-xs opacity-70">{t("historyHint")}</p>}
      </div>
    </div>
  )
}
