"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Search, X } from "lucide-react"
import { useTranslations } from "next-intl"

export function SearchInput({
  query,
  onQueryChange,
  onSubmit,
  onStop,
  searching,
  showSuggestions,
  onSuggestionClick,
}: {
  query: string
  onQueryChange: (q: string) => void
  onSubmit: () => void
  onStop: () => void
  searching: boolean
  showSuggestions: boolean
  onSuggestionClick: (s: string) => void
}) {
  const t = useTranslations("search")

  const suggestions = [
    t("suggestion1"), t("suggestion2"), t("suggestion3"),
    t("suggestion4"), t("suggestion5"), t("suggestion6"),
  ]

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-border/60">
        <div className="rounded-lg p-1.5 bg-indigo-100 dark:bg-indigo-950/50">
          <Search className="size-4 text-indigo-600 dark:text-indigo-400" />
        </div>
        <p className="font-semibold text-sm">{t("webTitle")}</p>
      </div>
      <div className="p-4 space-y-3">
        <form onSubmit={e => { e.preventDefault(); onSubmit() }} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder={t("inputPlaceholder")}
              value={query}
              onChange={e => onQueryChange(e.target.value)}
              className="pl-9"
            />
          </div>
          {searching ? (
            <Button type="button" variant="destructive" onClick={onStop} className="gap-2 shrink-0">
              <X className="size-4" />{t("stop")}
            </Button>
          ) : (
            <Button type="submit" disabled={!query.trim()} className="gap-2 shrink-0">
              <Search className="size-4" />{t("button")}
            </Button>
          )}
        </form>
        {showSuggestions && (
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map(s => (
              <button key={s} type="button" onClick={() => onSuggestionClick(s)}
                className="text-xs px-2.5 py-1 rounded-full border border-border bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
