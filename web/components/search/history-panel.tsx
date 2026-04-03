"use client"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Clock, Eye, RefreshCw, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { useTranslations } from "next-intl"
import type { SavedSearch } from "./types"
import { formatRelativeDate } from "./types"

export function HistoryPanel({
  items,
  loading,
  currentQuery,
  onView,
  onReSearch,
  onDeleteRequest,
}: {
  items: SavedSearch[]
  loading: boolean
  currentQuery: string
  onView: (item: SavedSearch) => void
  onReSearch: (query: string) => void
  onDeleteRequest: (item: SavedSearch) => void
}) {
  const t = useTranslations("search")

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
              <button className="flex-1 text-left min-w-0" onClick={() => onView(item)}>
                <p className={cn(
                  "text-sm truncate leading-snug",
                  currentQuery === item.query && "text-primary font-medium"
                )}>
                  {item.query}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatRelativeDate(item.created_at, {
                    justNow: t("justNow"),
                    minutesAgo: (n) => t("minutesAgo", { n }),
                    hoursAgo: (n) => t("hoursAgo", { n }),
                    daysAgo: (n) => t("daysAgo", { n }),
                  })}
                </p>
              </button>
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <Button variant="ghost" size="icon" className="size-6 text-muted-foreground hover:text-primary"
                  title={t("viewSaved")} onClick={() => onView(item)}>
                  <Eye className="size-3" />
                </Button>
                <Button variant="ghost" size="icon" className="size-6 text-muted-foreground hover:text-indigo-500"
                  title={t("reSearch")} onClick={() => onReSearch(item.query)}>
                  <RefreshCw className="size-3" />
                </Button>
                <Button variant="ghost" size="icon" className="size-6 text-muted-foreground hover:text-destructive"
                  title={t("deleteButton")} onClick={() => onDeleteRequest(item)}>
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
